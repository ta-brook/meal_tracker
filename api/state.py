import json
import os

from api import config, github


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


def write_user(uid, user, sha=None, message=None):
    """Write one user. In GitHub mode this creates a commit; message is the commit message."""
    relative_path = config.USER_FILES[uid]
    user = normalize_user(user, default_users()[uid])
    if config.persistent():
        content = json.dumps(user, ensure_ascii=False, indent=2)
        msg = message or f"Update {user.get('name', uid)} meal tracker data"
        github.put_contents(relative_path, content, sha, msg)
        return
    local_path = os.path.join(config.DATA_ROOT, relative_path)
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    with open(local_path, "w", encoding="utf-8") as f:
        json.dump(user, f, ensure_ascii=False, indent=2)