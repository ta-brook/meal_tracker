import json

from api import config, github, state


def normalize_meal(m):
    if not isinstance(m, dict) or not m.get("id") or not m.get("name"):
        return None
    return {
        "id": str(m["id"]),
        "name": str(m["name"]),
        "kcal": state._num(m.get("kcal")),
        "protein": state._num(m.get("protein")),
        "carbs": state._num(m.get("carbs")),
        "fat": state._num(m.get("fat")),
    }


def normalize_meals(meals):
    if not isinstance(meals, list):
        meals = []
    return [m for m in (normalize_meal(x) for x in meals) if m]


def read_meals():
    """Return (meals_list, sha). Reads GitHub-first; local fallback."""
    if config.persistent():
        try:
            data, sha = github.get_contents(config.MEALS_FILE)
            return normalize_meals(json.loads(data).get("meals", [])), sha
        except Exception:
            pass
    try:
        with open(config.MEALS_LOCAL, encoding="utf-8") as f:
            return normalize_meals(json.load(f).get("meals", [])), None
    except Exception:
        return [], None


def serialize(meals):
    return json.dumps({"meals": normalize_meals(meals)}, ensure_ascii=False, indent=2)