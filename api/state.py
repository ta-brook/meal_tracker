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
        "meals": [],
        "logs": {},
        "weights": [],
    }


def default_users():
    return {
        "book": empty_user("BOok", "male"),
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