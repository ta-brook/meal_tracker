---
name: meal-tracker
description: Use when working on the Meal Tracker app — a Flask/Vercel meal-logging app for two users (BOok and jingjing). Covers the modular Flask backend in api/ (config, github, state, catalog, index), the vanilla-JS frontend in static/app.js and templates/index.html, the two-user GitHub-backed state files (book/state.json, jingjing/state.json at repo root; data/ copies are the local fallback), the editable meal catalog (data/meals.csv + regenerated data/meals.xlsx), and GitHub persistence via the Contents API. Trigger on any task involving meal tracking, state.json, meals.csv, API endpoints, debounced saves, commit messages, profile switching, or deploy/config changes.
---

# Meal Tracker v4

A Flask app deployed on Vercel for two profiles: **BOok** (male) and **jingjing** (female). Each profile owns a separate meal library, daily logs, weights, calorie target, goal, and gender quantity profile.

## Layout

- `api/` — Flask backend split into modules (Vercel entry is `api/index.py` per `vercel.json`):
  - `api/index.py` — Flask app + all routes, `check_password()`, 409 handling (thin wiring layer).
  - `api/config.py` — env vars, paths, `USER_FILES`, catalog constants, `persistent()` helper.
  - `api/github.py` — low-level GitHub API: `gh()`, `get_contents()`, `get_contents_or_none()`, `put_contents()`.
  - `api/state.py` — user schema, normalization, per-user read/write (`empty_user`, `normalize_user(s)`, `read_user(s)`, `write_user`).
  - `api/catalog.py` — catalog CSV/XLSX read/write (`catalog_rows`, `catalog_source`, `write_catalog_source`, `write_catalog_xlsx`, `normalize_catalog_row`).
- `templates/index.html` — single page, tabs: Dashboard, Meals, Plan, Progress, Profile & Settings.
- `static/app.js` — vanilla JS state management and rendering; no build step, no framework.
- `static/style.css` — styling.
- `data/meals.csv` — meal catalog source of truth (read at runtime by the API).
- `data/meals.xlsx` — spreadsheet copy, regenerated server-side on every catalog write (needs `openpyxl`).
- `book/state.json`, `jingjing/state.json` — per-user state **on GitHub** (the Contents API writes use these repo-root paths via `USER_FILES`).
- `data/book/state.json`, `data/jingjing/state.json` — local fallback copies, used only when GitHub isn't configured (not the GitHub storage location).
- `vercel.json` — Vercel v2 config routing everything to `api/index.py`.
- `requirements.txt` — `Flask==3.1.0`, `openpyxl==3.1.5`.
- `.github/workflows/validate.yml` — compiles the `api/` package and JSON-validates both per-user state files.

## User state shape

Both state files use this schema:

```json
{
  "name": "BOok",
  "gender": "male",
  "target": 2000,
  "goal": null,
  "meals": [],
  "logs": {},
  "weights": []
}
```

- `gender` is `"male"` or `"female"`. Defaults: target 2000 (male) / 1600 (female).
- `meals`: array of custom meals `{id, name, kcal, protein, carbs, fat}`. Custom ids are `custom-<uuid>`.
- `logs`: map of `"YYYY-MM-DD"` → array of meal ids. Planned meal ids look like `plan-<week>-<meal>-<gender>`.
- `weights`: array of `{date: "YYYY-MM-DD", weight: number}`.
- `goal`: nullable number (target body weight in kg).

The backend normalizes both users on every read/write (`normalize_user`/`normalize_users` in `api/state.py`) and migrates legacy v3 keys `me`→`book`, `gf`→`jingjing`. Preserve this behavior.

## Backend conventions (`api/`)

- Env vars: `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH` (default `main`), `APP_PASSWORD` (optional). Read in `api/config.py`.
- `USER_FILES` maps `"book"`/`"jingjing"` to their fixed relative paths — do not make this configurable per README. **On GitHub these resolve to repo-root `book/state.json` and `jingjing/state.json`; `data/` is only prepended for local-file fallback.**
- GitHub persistence uses the Contents API via `api/github.py` (`gh()`, `get_contents()`, `put_contents()`). State writes are per-user: each `PUT`/`POST /api/state` reads each user's sha then writes each file separately (2 commits per save). On 409 the API returns "Data changed elsewhere. Reload and try again."
- `PUT /api/state` also accepts `POST` (used by the frontend's `navigator.sendBeacon` flush on page close) and an optional `message` body field used verbatim as the GitHub commit message for both users.
- Without GitHub vars, writes fall back to local files under `data/` (durable only locally, not on Vercel serverless).
- Auth: optional shared `APP_PASSWORD` checked against header `X-App-Password` on data endpoints (`check_password` in `api/index.py`). `/api/config`, `GET /api/meal-catalog`, and downloads stay open.
- Endpoints: `GET /` (page), `GET /api/config`, `GET /api/state`, `PUT|POST /api/state`, `GET|POST /api/meal-catalog` (GET open; POST/DELETE protected), `DELETE /api/meal-catalog`, `GET /download/meals.csv`, `GET /download/meals.xlsx`.
- Catalog add/delete build descriptive commit messages server-side (`Add meal "…" to catalog` / `Remove meal "…" from catalog`).
- The browser never receives the GitHub token; all GitHub I/O happens server-side.

## Meal catalog (`data/meals.csv`)

Columns: `week, meal, meal_name, gender, kcal, protein_g, carbs_g, fat_g, ingredients, method`.

- One row per meal per gender quantity profile (male and female rows for the same `week`/`meal`).
- `ingredients` and `method` are pipe-`|` separated lists rendered by the frontend.
- Text is Thai; keep encoding UTF-8 (the CSV reader/writer uses `utf-8-sig`).
- Editing the CSV + redeploy updates the app's plan data. `meals.xlsx` is regenerated automatically from the CSV by `write_catalog_xlsx` whenever a catalog write happens.

## Frontend conventions (`static/app.js`)

- Global `state = {users: {book, jingjing}, active_user}`; `KEY = "mealTrackerV4"` for localStorage, `mealTrackerPassword` in sessionStorage.
- Keep IDs stable across frontend/backend: user keys, meal ids, and catalog rows must line up exactly (see `findMeal`, `planMeals`).
- Rendering is imperative (`renderAll` → dashboard/meals/planView/progress/settings). `renderUserSwitch()` must be called at the top of each render.
- Strings are escaped with `esc()` when injected into innerHTML — keep this for any user-generated content (meal names, profile name, etc.).
- **Save path (debounced, batched):** every mutation calls `queueSave(msg)` → `migrate()` + `localSave()` immediately (no network), records the action message, and restarts a **30-second trailing debounce** → `flushSave()`. `flushSave()` sends one `PUT /api/state` with `{users, message}`; on failure it restores pending messages and reschedules; on 409 it reloads the latest server state. A `pagehide` handler flushes pending changes via `navigator.sendBeacon` (POST). `loadCloud()` clears pending messages on login. There is NO save-on-every-click — this keeps GitHub commit volume low (≤2 commits per 30s only when data changed).
- Each action passes a precise message, e.g. `Log meal "…" for BOok`, `Log weight 70.2kg for jingjing`, `Add custom meal "…"`, `Update profile for BOok`; batched actions are joined with `; `.
- Catalog management lives in the Meals tab: the CSV catalog renders as meal cards with one-click `+ Add` (logs `plan-<week>-<meal>-<gender>`) and Delete; `+ Add to catalog` opens a form that posts male+female rows to `POST /api/meal-catalog`.

## Testing / running locally

There is no test suite. Verify by:
1. `python -m flask --app api/index.py run` from the repo root (there is no `__main__` block). Flask serves `templates/` and `static/` relative to `api/`.
2. Exercising endpoints with curl (e.g. `GET /api/state`, `PUT /api/state` with a `message`, `POST/DELETE /api/meal-catalog`) against local files when GitHub vars are unset.
3. Checking `data/*/state.json` and `data/meals.csv` diffs after writes; confirm `data/meals.xlsx` is regenerated.

For CI there is `.github/workflows/validate.yml` — it runs `python -m compileall -q api` and JSON-validates `data/book/state.json` + `data/jingjing/state.json`.

## Deploy

Push to GitHub → import into Vercel → set `GITHUB_TOKEN` (fine-grained, Contents: Read+Write on the repo), `GITHUB_REPO`, `GITHUB_BRANCH`, optional `APP_PASSWORD` → deploy. Never commit `credentials/` secrets or the token (`.gitignore` already excludes `credentials/`).