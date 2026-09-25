import json
import urllib.error

from flask import Flask, jsonify, redirect, render_template, request, send_file, send_from_directory

from api import catalog, config, github, import_handlers, meals, prices, shared, state, strava_sync

app = Flask(__name__, template_folder="../templates", static_folder="../static")


def check_password(supplied=None, user=None):
    pw = supplied if supplied is not None else request.headers.get("X-App-Password")
    if not config.APP_PASSWORD and not any(config.USER_PASSWORDS.values()):
        return True
    if not pw:
        return False
    if pw == config.APP_PASSWORD:
        return True
    if user and pw == config.USER_PASSWORDS.get(user):
        return True
    if any(pw == p for p in config.USER_PASSWORDS.values() if p):
        return True
    return False


def _conflict():
    return jsonify(error="Data changed elsewhere. Reload and try again."), 409


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/sw.js")
def service_worker():
    return send_from_directory(config.ROOT, "sw.js", mimetype="application/javascript")


@app.get("/manifest.json")
def web_manifest():
    return send_from_directory(config.ROOT, "manifest.json", mimetype="application/manifest+json")


@app.get("/api/config")
def config_endpoint():
    has_any_password = bool(config.APP_PASSWORD) or any(config.USER_PASSWORDS.values())
    return jsonify({
        "auth": has_any_password,
        "persistent": config.persistent(),
        "storage": "GitHub: book/state.json + jingjing/state.json + meals.json" if config.persistent() else "Local files",
        "users": list(config.USER_FILES.keys()),
    })


@app.post("/api/login")
def login():
    body = request.get_json(force=True) or {}
    uid = str(body.get("user", "")).strip()
    pw = str(body.get("password", "")).strip()
    if uid not in config.USER_FILES:
        return jsonify(error="Invalid user"), 400
    if not check_password(pw, uid):
        return jsonify(error="Invalid password"), 401
    return jsonify(ok=True, user=uid)


@app.get("/api/state")
def get_state():
    if not check_password():
        return jsonify(error="Unauthorized"), 401
    return jsonify({
        "users": state.read_users(),
        "meals": meals.read_meals()[0],
        "shopping": shared.read("shopping"),
        "calendar": shared.read("calendar"),
        "finance": shared.read("finance"),
        "chores": shared.read("chores"),
    })


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
    for key in shared.SHARED_FILES:
        if key in body:
            new = shared.serialize(key, body.get(key))
            if github.read_file_text(shared.SHARED_FILES[key]) != new:
                changes[shared.SHARED_FILES[key]] = new

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


@app.put("/api/meal-catalog")
def update_meal_catalog():
    if not check_password():
        return jsonify(error="Unauthorized"), 401
    body = request.get_json(force=True) or {}
    name = str(body.get("meal_name", "")).strip()
    rows = body.get("rows")
    if not name:
        return jsonify(error="meal_name is required"), 400
    if not isinstance(rows, list) or not rows:
        return jsonify(error="rows array is required"), 400
    try:
        new_rows = [catalog.normalize_catalog_row(r) for r in rows]
    except ValueError as e:
        return jsonify(error=str(e)), 400
    current, _ = catalog.catalog_source()
    current = [r for r in current if str(r.get("meal_name", "")).strip() != name]
    current.extend(new_rows)
    message = f'Update meal "{name}" in catalog'
    try:
        catalog.write_catalog(current, message)
        return jsonify(ok=True, updated=len(new_rows))
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


@app.get("/api/prices")
def get_prices():
    # Open like /api/meal-catalog: market prices are not sensitive.
    return jsonify(prices.read_prices())


@app.post("/api/prices/refresh")
def refresh_prices():
    if not check_password():
        return jsonify(error="Unauthorized"), 401
    if not config.persistent():
        return jsonify(error="Cloud persistence required — GitHub is not configured."), 400
    try:
        data = prices.fetch_prices()
        github.commit_files({prices.PRICES_GIT: prices.serialize(data)}, "Update Makro PRO prices")
        return jsonify(ok=True, updated=data["updated"])
    except RuntimeError as e:
        if str(e) == "CONFLICT":
            return _conflict()
        return jsonify(error="Price refresh failed"), 500
    except Exception:
        return jsonify(error="Price refresh failed"), 500


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


@app.post("/api/import/file")
def import_file():
    """Import health data from an uploaded file (CSV or Apple Health ZIP/XML).

    Form fields:
      - file: the uploaded file
      - user: "book" or "jingjing" (defaults to "book")
      - source: optional source label (e.g. "garmin", "apple_health")
    """
    if not check_password():
        return jsonify(error="Unauthorized"), 401

    uploaded = request.files.get("file")
    uid = str(request.form.get("user", "book")).strip()
    source_label = str(request.form.get("source", "")).strip() or "upload"

    if not uploaded or uploaded.filename == "":
        return jsonify(error="file is required"), 400
    if uid not in config.USER_FILES:
        return jsonify(error="user must be book or jingjing"), 400

    filename = uploaded.filename.lower()
    try:
        file_bytes = uploaded.read()
        if filename.endswith(".csv"):
            text = file_bytes.decode("utf-8", errors="replace")
            result = import_handlers.parse_csv(text)
        elif filename.endswith(".zip") or filename.endswith(".xml"):
            result = import_handlers.parse_apple_health_xml(file_bytes)
        else:
            # Try CSV first, then XML
            try:
                text = file_bytes.decode("utf-8", errors="replace")
                result = import_handlers.parse_csv(text)
            except Exception:
                result = import_handlers.parse_apple_health_xml(file_bytes)
    except ValueError as e:
        return jsonify(error=str(e)), 400
    except Exception as e:
        return jsonify(error=f"Parse failed: {e}"), 400

    # Read current user state, merge, and save
    user, sha = state.read_user(uid)
    summary = import_handlers.merge_health_import(user, result)

    # Update import source metadata
    from datetime import datetime, timezone
    user.setdefault("import_sources", {})
    user["import_sources"][source_label] = datetime.now(timezone.utc).isoformat()

    rel = config.USER_FILES[uid]
    new_content = json.dumps(user, ensure_ascii=False, indent=2)

    try:
        if config.persistent():
            if github.read_file_text(rel) != new_content:
                github.commit_files({rel: new_content}, f"Import {source_label} health data for {user['name']}")
        else:
            github.write_files_local({rel: new_content})
        return jsonify(ok=True, summary=summary, source=result.get("type", "unknown"))
    except RuntimeError as e:
        if str(e) == "CONFLICT":
            return _conflict()
        return jsonify(error="Import save failed"), 500
    except urllib.error.HTTPError as e:
        if e.code == 409:
            return _conflict()
        return jsonify(error="Import save failed"), 500
    except Exception:
        return jsonify(error="Import save failed"), 500


# --- Strava auto-sync ---

@app.get("/api/strava/auth")
def strava_auth_url():
    """Return the Strava OAuth URL for the current user."""
    if not check_password():
        return jsonify(error="Unauthorized"), 401
    if not config.STRAVA_CLIENT_ID:
        return jsonify(error="Strava client ID is not configured"), 400
    redirect_uri = request.args.get("redirect_uri", "").strip()
    state_str = request.args.get("state", "").strip()
    if not redirect_uri:
        return jsonify(error="redirect_uri is required"), 400
    try:
        url = strava_sync.build_auth_url(redirect_uri, state_str=state_str)
        return jsonify(url=url)
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.get("/api/strava/callback")
def strava_callback():
    """OAuth callback from Strava. Exchange code for tokens, store them, then redirect home."""
    code = request.args.get("code", "").strip()
    uid = request.args.get("state", "book").strip()
    if not code:
        return redirect("/?strava=error#settings")
    if uid not in config.USER_FILES:
        return redirect("/?strava=error#settings")

    try:
        token_data = strava_sync.exchange_code(code)
    except Exception:
        return redirect("/?strava=error#settings")

    user, _ = state.read_user(uid)
    user["strava"] = {
        "access_token": token_data.get("access_token"),
        "refresh_token": token_data.get("refresh_token"),
        "expires_at": token_data.get("expires_at"),
        "athlete_id": token_data.get("athlete", {}).get("id"),
    }

    rel = config.USER_FILES[uid]
    new_content = json.dumps(user, ensure_ascii=False, indent=2)
    try:
        if config.persistent():
            if github.read_file_text(rel) != new_content:
                github.commit_files({rel: new_content}, f"Connect Strava for {user['name']}")
        else:
            github.write_files_local({rel: new_content})
        return redirect("/?strava=connected#settings")
    except Exception:
        return redirect("/?strava=error#settings")


@app.post("/api/strava/sync")
def strava_manual_sync():
    """Manually trigger a Strava sync for a user."""
    if not check_password():
        return jsonify(error="Unauthorized"), 401
    body = request.get_json(force=True) or {}
    uid = str(body.get("user", state.active_user or "book")).strip()
    if uid not in config.USER_FILES:
        return jsonify(error="user must be book or jingjing"), 400
    try:
        summary, error = strava_sync.sync_user(uid)
        if error:
            return jsonify(error=error), 400
        return jsonify(ok=True, summary=summary)
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.route("/api/webhook/strava", methods=["GET", "POST"])
def strava_webhook():
    """Strava webhook subscription validation and event receiver."""
    if request.method == "GET":
        # Subscription validation
        mode = request.args.get("hub.mode", "")
        challenge = request.args.get("hub.challenge", "")
        verify_token = request.args.get("hub.verify_token", "")
        if mode == "subscribe" and verify_token == config.STRAVA_WEBHOOK_VERIFY_TOKEN:
            return jsonify({"hub.challenge": challenge})
        return jsonify(error="Invalid verification"), 403

    if request.method == "POST":
        # Event payload
        payload = request.get_json(force=True) or {}
        # Strava sends minimal payloads; we need to look up the user by athlete_id
        # and queue a sync. For simplicity we just note the event.
        owner_id = payload.get("owner_id")
        object_type = payload.get("object_type")
        aspect_type = payload.get("aspect_type")
        if object_type == "activity" and aspect_type in ("create", "update"):
            # Find user with matching athlete_id and sync
            for uid in config.USER_FILES:
                user, _ = state.read_user(uid)
                strava_meta = user.get("strava") or {}
                if strava_meta.get("athlete_id") == owner_id:
                    try:
                        strava_sync.sync_user(uid)
                    except Exception:
                        pass
                    break
        return jsonify(ok=True)