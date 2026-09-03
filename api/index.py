import base64
import csv
import io
import json
import os
import urllib.error
import urllib.request
from flask import Flask, render_template, request, jsonify, send_file
from openpyxl import Workbook

app = Flask(__name__, template_folder="../templates", static_folder="../static")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_REPO = os.getenv("GITHUB_REPO")
GITHUB_BRANCH = os.getenv("GITHUB_BRANCH", "main")
APP_PASSWORD = os.getenv("APP_PASSWORD")
DATA_ROOT = os.path.join(os.path.dirname(__file__), "..", "data")
USER_FILES = {
    "book": "book/state.json",
    "jingjing": "jingjing/state.json",
}
CATALOG_CSV = os.path.join(DATA_ROOT, "meals.csv")
CATALOG_XLSX = os.path.join(DATA_ROOT, "meals.xlsx")
CATALOG_HEADERS = ["week", "meal", "meal_name", "gender", "kcal", "protein_g", "carbs_g", "fat_g", "ingredients", "method"]


def empty_user(name, gender="male"):
    return {
        "name": name,
        "gender": gender,
        "target": 2000 if gender == "male" else 1600,
        "goal": None,
        "meals": [],
        "logs": {},
        "weights": [],
    }


def default_users():
    return {
        "book": empty_user("BOok", "male"),
        "jingjing": empty_user("jingjing", "female"),
    }


def normalize_user(user, fallback):
    user = dict(user or {})
    for k, v in fallback.items():
        user.setdefault(k, v)
    return user


def normalize_users(users):
    users = users or {}
    defaults = default_users()
    # Upgrade old v3 ids if present.
    if "me" in users and "book" not in users:
        users["book"] = users.pop("me")
    if "gf" in users and "jingjing" not in users:
        users["jingjing"] = users.pop("gf")
    users["book"] = normalize_user(users.get("book"), defaults["book"])
    users["jingjing"] = normalize_user(users.get("jingjing"), defaults["jingjing"])
    users["book"]["name"] = users["book"].get("name") or "BOok"
    users["jingjing"]["name"] = users["jingjing"].get("name") or "jingjing"
    return users


def check_password():
    return not APP_PASSWORD or request.headers.get("X-App-Password") == APP_PASSWORD


def gh(method, path, payload=None):
    if not GITHUB_TOKEN:
        raise RuntimeError("GITHUB_TOKEN is not configured")
    req = urllib.request.Request("https://api.github.com" + path, method=method)
    req.add_header("Authorization", "Bearer " + GITHUB_TOKEN)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if payload is not None:
        raw = json.dumps(payload, ensure_ascii=False).encode()
        req.data = raw
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())


def read_github_json(relative_path):
    try:
        r = gh("GET", f"/repos/{GITHUB_REPO}/contents/{relative_path}?ref={GITHUB_BRANCH}")
        return json.loads(base64.b64decode(r["content"]).decode()), r["sha"]
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None, None
        raise


def read_user(uid):
    relative_path = USER_FILES[uid]
    local_path = os.path.join(DATA_ROOT, relative_path)
    if GITHUB_TOKEN and GITHUB_REPO:
        try:
            data, sha = read_github_json(relative_path)
            if data is not None:
                return normalize_user(data, default_users()[uid]), sha
        except Exception:
            pass
    try:
        with open(local_path, encoding="utf-8") as f:
            return normalize_user(json.load(f), default_users()[uid]), None
    except Exception:
        return default_users()[uid], None


def read_users():
    book, _ = read_user("book")
    jingjing, _ = read_user("jingjing")
    return {"book": book, "jingjing": jingjing}


def write_user(uid, user, sha=None):
    relative_path = USER_FILES[uid]
    user = normalize_user(user, default_users()[uid])
    if GITHUB_TOKEN and GITHUB_REPO:
        content = base64.b64encode(json.dumps(user, ensure_ascii=False, indent=2).encode()).decode()
        payload = {
            "message": f"Update {user.get('name', uid)} meal tracker data",
            "content": content,
            "branch": GITHUB_BRANCH,
        }
        if sha:
            payload["sha"] = sha
        gh("PUT", f"/repos/{GITHUB_REPO}/contents/{relative_path}", payload)
        return
    local_path = os.path.join(DATA_ROOT, relative_path)
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    with open(local_path, "w", encoding="utf-8") as f:
        json.dump(user, f, ensure_ascii=False, indent=2)


def catalog_rows():
    rows = []
    if not os.path.exists(CATALOG_CSV):
        return rows
    with open(CATALOG_CSV, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            rows.append(row)
    return rows


def catalog_source():
    """Return (rows, sha). Reads GitHub-first so UI edits are visible immediately."""
    if GITHUB_TOKEN and GITHUB_REPO:
        try:
            r = gh("GET", f"/repos/{GITHUB_REPO}/contents/data/meals.csv?ref={GITHUB_BRANCH}")
            text = base64.b64decode(r["content"]).decode("utf-8-sig")
            return list(csv.DictReader(io.StringIO(text))), r["sha"]
        except Exception:
            pass
    return catalog_rows(), None


def write_catalog_source(rows, sha):
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CATALOG_HEADERS)
    writer.writeheader()
    writer.writerows(rows)
    text = buf.getvalue()
    if GITHUB_TOKEN and GITHUB_REPO:
        content = base64.b64encode(text.encode()).decode()
        payload = {
            "message": "Update meal catalog",
            "content": content,
            "branch": GITHUB_BRANCH,
        }
        if sha:
            payload["sha"] = sha
        gh("PUT", f"/repos/{GITHUB_REPO}/contents/data/meals.csv", payload)
    else:
        with open(CATALOG_CSV, "w", encoding="utf-8-sig", newline="") as f:
            f.write(text)


def write_catalog_xlsx(rows):
    wb = Workbook()
    ws = wb.active
    ws.title = "meals"
    ws.append(CATALOG_HEADERS)
    for row in rows:
        ws.append([row.get(h, "") for h in CATALOG_HEADERS])
    buf = io.BytesIO()
    wb.save(buf)
    payload = buf.getvalue()
    if GITHUB_TOKEN and GITHUB_REPO:
        sha = None
        try:
            r = gh("GET", f"/repos/{GITHUB_REPO}/contents/data/meals.xlsx?ref={GITHUB_BRANCH}")
            sha = r["sha"]
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
        body = {
            "message": "Update meal catalog (xlsx)",
            "content": base64.b64encode(payload).decode(),
            "branch": GITHUB_BRANCH,
        }
        if sha:
            body["sha"] = sha
        gh("PUT", f"/repos/{GITHUB_REPO}/contents/data/meals.xlsx", body)
    else:
        with open(CATALOG_XLSX, "wb") as f:
            f.write(payload)


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/config")
def config():
    return jsonify({
        "auth": bool(APP_PASSWORD),
        "persistent": bool(GITHUB_TOKEN and GITHUB_REPO),
        "storage": "GitHub: data/book/state.json + data/jingjing/state.json" if GITHUB_TOKEN and GITHUB_REPO else "Local files",
    })


@app.get("/api/state")
def get_state():
    if not check_password():
        return jsonify(error="Unauthorized"), 401
    return jsonify({"users": read_users()})


@app.put("/api/state")
def put_state():
    if not check_password():
        return jsonify(error="Unauthorized"), 401
    body = request.get_json(force=True) or {}
    users = normalize_users(body.get("users", body))
    try:
        # Each user's record is committed to its own GitHub folder/file.
        for uid in USER_FILES:
            _, sha = read_user(uid)
            write_user(uid, users[uid], sha)
        return jsonify(ok=True, persistent=bool(GITHUB_TOKEN and GITHUB_REPO))
    except urllib.error.HTTPError as e:
        if e.code == 409:
            return jsonify(error="Data changed elsewhere. Reload and try again."), 409
        return jsonify(error="GitHub save failed"), 500
    except Exception:
        return jsonify(error="Save failed"), 500


@app.get("/api/meal-catalog")
def meal_catalog():
    # Open like the /download/* endpoints: the meal catalog is not sensitive.
    rows, _ = catalog_source()
    return jsonify(rows)


def _normalize_catalog_row(row):
    if not isinstance(row, dict):
        raise ValueError("row must be an object")
    out = {}
    for h in CATALOG_HEADERS:
        out[h] = ""
    for k, v in row.items():
        if k in CATALOG_HEADERS:
            out[k] = v if isinstance(v, (str, int, float)) else str(v)
    for k in ("week", "meal"):
        if not str(out.get(k, "")).strip():
            raise ValueError(f"missing required field: {k}")
    if not str(out.get("meal_name", "")).strip():
        raise ValueError("missing required field: meal_name")
    if out.get("gender") not in ("male", "female"):
        raise ValueError("gender must be 'male' or 'female'")
    for k in ("kcal", "protein_g", "carbs_g", "fat_g"):
        try:
            out[k] = str(float(out.get(k) or 0))
        except (TypeError, ValueError):
            raise ValueError(f"invalid number for {k}")
    out["ingredients"] = out.get("ingredients", "")
    out["method"] = out.get("method", "")
    return out


@app.post("/api/meal-catalog")
def add_meal_catalog():
    if not check_password():
        return jsonify(error="Unauthorized"), 401
    body = request.get_json(force=True) or {}
    rows = body.get("rows")
    if not isinstance(rows, list) or not rows:
        return jsonify(error="rows array is required"), 400
    try:
        new_rows = [_normalize_catalog_row(r) for r in rows]
    except ValueError as e:
        return jsonify(error=str(e)), 400
    current, sha = catalog_source()
    current.extend(new_rows)
    try:
        write_catalog_source(current, sha)
        write_catalog_xlsx(current)
        return jsonify(ok=True, added=len(new_rows))
    except urllib.error.HTTPError as e:
        if e.code == 409:
            return jsonify(error="Data changed elsewhere. Reload and try again."), 409
        return jsonify(error="Catalog save failed"), 500
    except Exception:
        return jsonify(error="Catalog save failed"), 500


@app.delete("/api/meal-catalog")
def delete_meal_catalog():
    if not check_password():
        return jsonify(error="Unauthorized"), 401
    body = request.get_json(force=True) or {}
    name = str(body.get("meal_name", "")).strip()
    if not name:
        return jsonify(error="meal_name is required"), 400
    current, sha = catalog_source()
    before = len(current)
    current = [r for r in current if str(r.get("meal_name", "")).strip() != name]
    removed = before - len(current)
    if removed == 0:
        return jsonify(ok=True, removed=0)
    try:
        write_catalog_source(current, sha)
        write_catalog_xlsx(current)
        return jsonify(ok=True, removed=removed)
    except urllib.error.HTTPError as e:
        if e.code == 409:
            return jsonify(error="Data changed elsewhere. Reload and try again."), 409
        return jsonify(error="Catalog save failed"), 500
    except Exception:
        return jsonify(error="Catalog save failed"), 500


@app.get("/download/meals.csv")
def download_csv():
    return send_file(CATALOG_CSV, as_attachment=True, download_name="meals.csv", mimetype="text/csv")


@app.get("/download/meals.xlsx")
def download_xlsx():
    return send_file(
        CATALOG_XLSX,
        as_attachment=True,
        download_name="meals.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
