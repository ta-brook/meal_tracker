import json
import urllib.error

from flask import Flask, jsonify, render_template, request, send_file

from api import catalog, config, github, meals, state

app = Flask(__name__, template_folder="../templates", static_folder="../static")


def check_password():
    return not config.APP_PASSWORD or request.headers.get("X-App-Password") == config.APP_PASSWORD


def _conflict():
    return jsonify(error="Data changed elsewhere. Reload and try again."), 409


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/config")
def config_endpoint():
    return jsonify({
        "auth": bool(config.APP_PASSWORD),
        "persistent": config.persistent(),
        "storage": "GitHub: book/state.json + jingjing/state.json + meals.json" if config.persistent() else "Local files",
    })


@app.get("/api/state")
def get_state():
    if not check_password():
        return jsonify(error="Unauthorized"), 401
    return jsonify({"users": state.read_users(), "meals": meals.read_meals()[0]})


@app.route("/api/state", methods=["PUT", "POST"])
def put_state():
    """Save users and/or the shared meal library atomically.

    Only files whose content actually changed are written. In GitHub mode all
    changed files land in ONE commit (all-or-nothing). Accepts an optional
    `message` used as the commit message. POST supports the page-close flush.
    """
    if not check_password():
        return jsonify(error="Unauthorized"), 401
    body = request.get_json(force=True) or {}
    message = str(body.get("message") or "").strip() or None

    changes = {}
    if "users" in body:
        users = state.normalize_users(body.get("users"))
        for uid in config.USER_FILES:
            rel = config.USER_FILES[uid]
            new = json.dumps(users[uid], ensure_ascii=False, indent=2)
            if github.read_file_text(rel) != new:
                changes[rel] = new
    if "meals" in body:
        new_meals = meals.serialize(body.get("meals"))
        if github.read_file_text(config.MEALS_FILE) != new_meals:
            changes[config.MEALS_FILE] = new_meals

    if not changes:
        return jsonify(ok=True, persistent=config.persistent())

    try:
        if config.persistent():
            github.commit_files(changes, message or "Update meal tracker state")
        else:
            github.write_files_local(changes)
        return jsonify(ok=True, persistent=config.persistent())
    except RuntimeError as e:
        if str(e) == "CONFLICT":
            return _conflict()
        return jsonify(error="GitHub save failed"), 500
    except urllib.error.HTTPError as e:
        if e.code == 409:
            return _conflict()
        return jsonify(error="GitHub save failed"), 500
    except Exception:
        return jsonify(error="Save failed"), 500


@app.get("/api/meal-catalog")
def meal_catalog():
    # Open like the /download/* endpoints: the meal catalog is not sensitive.
    rows, _ = catalog.catalog_source()
    return jsonify(rows)


@app.post("/api/meal-catalog")
def add_meal_catalog():
    if not check_password():
        return jsonify(error="Unauthorized"), 401
    body = request.get_json(force=True) or {}
    rows = body.get("rows")
    if not isinstance(rows, list) or not rows:
        return jsonify(error="rows array is required"), 400
    try:
        new_rows = [catalog.normalize_catalog_row(r) for r in rows]
    except ValueError as e:
        return jsonify(error=str(e)), 400
    name = new_rows[0].get("meal_name", "")
    current, _ = catalog.catalog_source()
    current.extend(new_rows)
    message = f'Add meal "{name}" to catalog' if name else "Update meal catalog"
    try:
        catalog.write_catalog(current, message)
        return jsonify(ok=True, added=len(new_rows))
    except RuntimeError as e:
        if str(e) == "CONFLICT":
            return _conflict()
        return jsonify(error="Catalog save failed"), 500
    except urllib.error.HTTPError as e:
        if e.code == 409:
            return _conflict()
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
    current, _ = catalog.catalog_source()
    before = len(current)
    current = [r for r in current if str(r.get("meal_name", "")).strip() != name]
    removed = before - len(current)
    if removed == 0:
        return jsonify(ok=True, removed=0)
    message = f'Remove meal "{name}" from catalog'
    try:
        catalog.write_catalog(current, message)
        return jsonify(ok=True, removed=removed)
    except RuntimeError as e:
        if str(e) == "CONFLICT":
            return _conflict()
        return jsonify(error="Catalog save failed"), 500
    except urllib.error.HTTPError as e:
        if e.code == 409:
            return _conflict()
        return jsonify(error="Catalog save failed"), 500
    except Exception:
        return jsonify(error="Catalog save failed"), 500


@app.get("/download/meals.csv")
def download_csv():
    return send_file(config.CATALOG_CSV, as_attachment=True, download_name="meals.csv", mimetype="text/csv")


@app.get("/download/meals.xlsx")
def download_xlsx():
    return send_file(
        config.CATALOG_XLSX,
        as_attachment=True,
        download_name="meals.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )