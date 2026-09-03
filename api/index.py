import urllib.error

from flask import Flask, jsonify, render_template, request, send_file

from api import catalog, config, state

app = Flask(__name__, template_folder="../templates", static_folder="../static")


def check_password():
    return not config.APP_PASSWORD or request.headers.get("X-App-Password") == config.APP_PASSWORD


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/config")
def config_endpoint():
    return jsonify({
        "auth": bool(config.APP_PASSWORD),
        "persistent": config.persistent(),
        "storage": "GitHub: data/book/state.json + data/jingjing/state.json" if config.persistent() else "Local files",
    })


@app.get("/api/state")
def get_state():
    if not check_password():
        return jsonify(error="Unauthorized"), 401
    return jsonify({"users": state.read_users()})


@app.route("/api/state", methods=["PUT", "POST"])
def put_state():
    """Save both users. Accepts an optional `message` used as the GitHub commit message.

    POST is accepted so the frontend can flush on page close via navigator.sendBeacon.
    """
    if not check_password():
        return jsonify(error="Unauthorized"), 401
    body = request.get_json(force=True) or {}
    users = state.normalize_users(body.get("users", body))
    message = str(body.get("message") or "").strip() or None
    try:
        # Each user's record is committed to its own GitHub folder/file.
        for uid in config.USER_FILES:
            _, sha = state.read_user(uid)
            state.write_user(uid, users[uid], sha, message)
        return jsonify(ok=True, persistent=config.persistent())
    except urllib.error.HTTPError as e:
        if e.code == 409:
            return jsonify(error="Data changed elsewhere. Reload and try again."), 409
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
    current, sha = catalog.catalog_source()
    current.extend(new_rows)
    message = f'Add meal "{name}" to catalog' if name else "Update meal catalog"
    try:
        catalog.write_catalog_source(current, sha, message)
        catalog.write_catalog_xlsx(current)
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
    current, sha = catalog.catalog_source()
    before = len(current)
    current = [r for r in current if str(r.get("meal_name", "")).strip() != name]
    removed = before - len(current)
    if removed == 0:
        return jsonify(ok=True, removed=0)
    message = f'Remove meal "{name}" from catalog'
    try:
        catalog.write_catalog_source(current, sha, message)
        catalog.write_catalog_xlsx(current)
        return jsonify(ok=True, removed=removed)
    except urllib.error.HTTPError as e:
        if e.code == 409:
            return jsonify(error="Data changed elsewhere. Reload and try again."), 409
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