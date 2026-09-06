import json
import os

from api import config, github

SHARED_FILES = {
    "shopping": "shopping.json",
    "calendar": "calendar.json",
    "finance": "finance.json",
    "chores": "chores.json",
}


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _norm_shopping(d):
    d = d or {}
    out = {"items": []}
    items = d.get("items")
    if isinstance(items, list):
        for it in items:
            if not isinstance(it, dict) or not it.get("id") or not it.get("name"):
                continue
            cat = it.get("category")
            if cat not in ("food", "home", "health"):
                cat = "food"
            out["items"].append({
                "id": str(it["id"]),
                "name": str(it["name"]),
                "category": cat,
                "done": bool(it.get("done")),
                "added_by": str(it.get("added_by") or ""),
            })
    return out


def _norm_calendar(d):
    d = d or {}
    out = {"events": []}
    events = d.get("events")
    if isinstance(events, list):
        for ev in events:
            if not isinstance(ev, dict) or not ev.get("id") or not ev.get("title"):
                continue
            kind = ev.get("kind")
            if kind not in ("personal", "shared"):
                kind = "shared"
            out["events"].append({
                "id": str(ev["id"]),
                "title": str(ev["title"]),
                "date": str(ev.get("date") or ""),
                "kind": kind,
                "user": str(ev.get("user") or "") if kind == "personal" else "",
                "note": str(ev.get("note") or ""),
            })
    return out


def _norm_finance(d):
    d = d or {}
    out = {"transactions": [], "budgets": {}}
    txs = d.get("transactions")
    if isinstance(txs, list):
        for t in txs:
            if not isinstance(t, dict) or not t.get("id"):
                continue
            paid = t.get("paid_by")
            if paid not in ("book", "jingjing"):
                paid = "book"
            out["transactions"].append({
                "id": str(t["id"]),
                "description": str(t.get("description") or ""),
                "category": str(t.get("category") or "other"),
                "amount": _num(t.get("amount")),
                "paid_by": paid,
                "date": str(t.get("date") or ""),
                "settled": bool(t.get("settled")),
            })
    budgets = d.get("budgets")
    if isinstance(budgets, dict):
        for month, cats in budgets.items():
            if not isinstance(cats, dict):
                continue
            out["budgets"][str(month)] = {str(k): _num(v) for k, v in cats.items() if _num(v) > 0}
    return out


def _norm_chores(d):
    d = d or {}
    out = {"chores": []}
    chores = d.get("chores")
    if isinstance(chores, list):
        for c in chores:
            if not isinstance(c, dict) or not c.get("id") or not c.get("name"):
                continue
            done = c.get("done")
            dmap = {}
            if isinstance(done, dict):
                for date, who in done.items():
                    if who in ("book", "jingjing"):
                        dmap[str(date)] = who
            out["chores"].append({"id": str(c["id"]), "name": str(c["name"]), "done": dmap})
    return out


def _defaults():
    return {
        "shopping": {"items": []},
        "calendar": {"events": []},
        "finance": {"transactions": [], "budgets": {}},
        "chores": {"chores": []},
    }


def normalize(key, data):
    if key == "shopping":
        return _norm_shopping(data)
    if key == "calendar":
        return _norm_calendar(data)
    if key == "finance":
        return _norm_finance(data)
    if key == "chores":
        return _norm_chores(data)
    return _defaults()[key]


def read(key):
    """Return the parsed shared payload for key. Reads GitHub-first; local fallback."""
    rel = SHARED_FILES[key]
    if config.persistent():
        try:
            text, _ = github.get_contents(rel)
            return normalize(key, json.loads(text))
        except Exception:
            pass
    local = os.path.join(config.DATA_ROOT, rel)
    try:
        with open(local, encoding="utf-8") as f:
            return normalize(key, json.load(f))
    except Exception:
        return _defaults()[key]


def serialize(key, data):
    return json.dumps(normalize(key, data), ensure_ascii=False, indent=2)