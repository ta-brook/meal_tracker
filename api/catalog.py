import csv
import io
import os

from openpyxl import Workbook

from api import config, github


def catalog_rows():
    """Read the local catalog CSV (no GitHub)."""
    rows = []
    if not os.path.exists(config.CATALOG_CSV):
        return rows
    with open(config.CATALOG_CSV, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            rows.append(row)
    return rows


def catalog_source():
    """Return (rows, sha). Reads GitHub-first so UI edits are visible immediately."""
    if config.persistent():
        try:
            text, sha = github.get_contents("data/meals.csv")
            return list(csv.DictReader(io.StringIO(text))), sha
        except Exception:
            pass
    return catalog_rows(), None


def write_catalog_source(rows, sha, message="Update meal catalog"):
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=config.CATALOG_HEADERS)
    writer.writeheader()
    writer.writerows(rows)
    text = buf.getvalue()
    if config.persistent():
        github.put_contents("data/meals.csv", text, sha, message)
    else:
        with open(config.CATALOG_CSV, "w", encoding="utf-8-sig", newline="") as f:
            f.write(text)


def write_catalog_xlsx(rows):
    """Regenerate meals.xlsx from the rows (keeps the spreadsheet download in sync)."""
    wb = Workbook()
    ws = wb.active
    ws.title = "meals"
    ws.append(config.CATALOG_HEADERS)
    for row in rows:
        ws.append([row.get(h, "") for h in config.CATALOG_HEADERS])
    buf = io.BytesIO()
    wb.save(buf)
    payload = buf.getvalue()
    if config.persistent():
        _, sha = github.get_contents_or_none("data/meals.xlsx", binary=True)
        github.put_contents("data/meals.xlsx", payload, sha, "Update meal catalog (xlsx)", binary=True)
    else:
        with open(config.CATALOG_XLSX, "wb") as f:
            f.write(payload)


def normalize_catalog_row(row):
    """Validate and coerce one incoming catalog row into a clean dict."""
    if not isinstance(row, dict):
        raise ValueError("row must be an object")
    out = {}
    for h in config.CATALOG_HEADERS:
        out[h] = ""
    for k, v in row.items():
        if k in config.CATALOG_HEADERS:
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