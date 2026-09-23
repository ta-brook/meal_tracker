import json
import os

from api import config, github


def empty_user(name, gender="male"):
    return {
        "name": name,
        "gender": gender,
        "target": 2000 if gender == "male" else 1600,
        "goal": None,
        "age": None,
        "height": None,
        "protein_goal": None,
        "carbs_goal": None,
        "fat_goal": None,
        "meals": [],
        "logs": {},
        "weights": [],
        "water": {},
        "moods": {},
        "health": {"sleep": [], "exercise": [], "daily": {}},
        "import_sources": {},
    }


def default_users():
    return {
        "book": empty_user("book", "male"),
        "jingjing": empty_user("jingjing", "female"),
    }


def _num(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def normalize_user(user, fallback):
    """Coerce a raw user dict into the guaranteed schema. Never raises."""
    user = dict(user or {})
    name = user.get("name")
    user["name"] = str(name).strip() if name else fallback["name"]

    if user.get("gender") not in ("male", "female"):
        user["gender"] = fallback["gender"]

    try:
        user["target"] = max(0, int(user.get("target", fallback["target"])))
    except (TypeError, ValueError):
        user["target"] = fallback["target"]

    goal = user.get("goal")
    if goal in (None, ""):
        user["goal"] = None
    else:
        user["goal"] = _num(goal) or None

    age = user.get("age")
    if age in (None, ""):
        user["age"] = None
    else:
        try:
            user["age"] = max(1, int(age))
        except (TypeError, ValueError):
            user["age"] = None

    height = user.get("height")
    if height in (None, ""):
        user["height"] = None
    else:
        try:
            user["height"] = min(250, max(1, int(height)))
        except (TypeError, ValueError):
            user["height"] = None

    for key in ("protein_goal", "carbs_goal", "fat_goal"):
        value = user.get(key)
        if value in (None, ""):
            user[key] = None
        else:
            try:
                user[key] = max(0, int(value))
            except (TypeError, ValueError):
                user[key] = None

    meals = user.get("meals")
    if not isinstance(meals, list):
        meals = []
    user["meals"] = []
    for m in meals:
        if not isinstance(m, dict) or not m.get("id") or not m.get("name"):
            continue
        user["meals"].append({
            "id": str(m["id"]),
            "name": str(m["name"]),
            "kcal": _num(m.get("kcal")),
            "protein": _num(m.get("protein")),
            "carbs": _num(m.get("carbs")),
            "fat": _num(m.get("fat")),
        })

    logs = user.get("logs")
    if not isinstance(logs, dict):
        logs = {}
    user["logs"] = {}
    for date, ids in logs.items():
        if isinstance(ids, list):
            user["logs"][str(date)] = [str(i) for i in ids if i is not None]

    weights = user.get("weights")
    if not isinstance(weights, list):
        weights = []
    user["weights"] = []
    for w in weights:
        if not isinstance(w, dict) or not w.get("date") or w.get("weight") in (None, ""):
            continue
        try:
            user["weights"].append({"date": str(w["date"]), "weight": float(w["weight"])})
        except (TypeError, ValueError):
            continue

    water = user.get("water")
    if not isinstance(water, dict):
        water = {}
    user["water"] = {}
    for date, count in water.items():
        try:
            user["water"][str(date)] = max(0, int(count))
        except (TypeError, ValueError):
            continue

    moods = user.get("moods")
    if not isinstance(moods, dict):
        moods = {}
    user["moods"] = {}
    for date, key in moods.items():
        if isinstance(key, str) and key:
            user["moods"][str(date)] = key[:12]

    health = user.get("health")
    if not isinstance(health, dict):
        health = {}
    user["health"] = {"sleep": [], "exercise": [], "daily": {}}
    for item in health.get("sleep") or []:
        if not isinstance(item, dict) or not item.get("date"):
            continue
        user["health"]["sleep"].append({
            "date": str(item["date"]),
            "score": _num(item.get("score")),
            "hours": _num(item.get("hours")),
            "deep": _num(item.get("deep")),
            "light": _num(item.get("light")),
            "rem": _num(item.get("rem")),
            "awake": _num(item.get("awake")),
        })
    for item in health.get("exercise") or []:
        if not isinstance(item, dict) or not item.get("date"):
            continue
        user["health"]["exercise"].append({
            "date": str(item["date"]),
            "type": str(item.get("type") or "").strip() or "Other",
            "duration": _num(item.get("duration")),
            "distance": _num(item.get("distance")),
            "calories": _num(item.get("calories")),
            "hr_avg": _num(item.get("hr_avg")),
        })

    daily = health.get("daily")
    if isinstance(daily, dict):
        for date, metrics in daily.items():
            if not isinstance(metrics, dict):
                continue
            clean = {}
            for k, v in metrics.items():
                if k in ("steps",):
                    try:
                        clean[k] = max(0, int(v))
                    except (TypeError, ValueError):
                        pass
                else:
                    try:
                        clean[k] = float(v)
                    except (TypeError, ValueError):
                        pass
            if clean:
                user["health"]["daily"][str(date)] = clean

    # Import source metadata (stores last import timestamps per source)
    import_sources = user.get("import_sources")
    if not isinstance(import_sources, dict):
        import_sources = {}
    user["import_sources"] = import_sources

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
    users["book"]["name"] = users["book"].get("name") or "book"
    users["jingjing"]["name"] = users["jingjing"].get("name") or "jingjing"
    return users


def read_user(uid):
    """Read one user. Returns (normalized_user, sha). sha is None in local mode."""
    relative_path = config.USER_FILES[uid]
    local_path = os.path.join(config.DATA_ROOT, relative_path)
    if config.persistent():
        try:
            data, sha = github.get_contents(relative_path)
            return normalize_user(json.loads(data), default_users()[uid]), sha
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