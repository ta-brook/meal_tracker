---
name: meal-tracker
description: Use when working on the Meal Tracker app — a Flask/Vercel meal-logging app for two users (BOok and jingjing). Covers the modular Flask backend in api/ (config, github, state, catalog, meals, index), the vanilla-JS frontend in static/app.js and templates/index.html, GitHub-backed data (book/state.json, jingjing/state.json, meals.json at repo root; data/ copies are the local fallback), the editable meal catalog (data/meals.csv + regenerated data/meals.xlsx), atomic Git-Data-API commits, debounced saves, the pastel UI tokens in .interface-design/system.md, and deploy/config. Trigger on any task involving meal tracking, state.json, meals.json, meals.csv, API endpoints, shared meals, saves/commits, profile switching, or deploy/config changes.
---

# Meal Tracker v4

A Flask app deployed on Vercel for two profiles: **BOok** (male) and **jingjing** (female). Custom meals are **shared app-wide** (one library for both profiles); planned meals come from the editable catalog.

## Layout

- `api/` — Flask backend split into modules (Vercel entry is `api/index.py` per `vercel.json`):
  - `api/index.py` — Flask app + all routes, `check_password()`, conflict handling (thin wiring layer).
  - `api/config.py` — env vars, paths, `USER_FILES`, shared-meals + catalog constants, `persistent()` helper.
  - `api/github.py` — GitHub API: `gh()`, `get_contents()`, `put_contents()`, `read_file_text()`, `write_files_local()`, and **`commit_files(changes, message)`** — one atomic commit for many files via the Git Data API (blobs → tree → commit → ref).
  - `api/state.py` — user schema + deep validation/coercion, per-user read (`read_user(s)`), and atomic-friendly serialization.
  - `api/meals.py` — shared custom-meal library (`read_meals`, `normalize_meals`, `serialize`).
  - `api/catalog.py` — catalog CSV/XLSX read/write (`catalog_source`, `write_catalog`, `normalize_catalog_row`).
- `templates/index.html` — single page, tabs: Dashboard, Meals, Plan, Progress, Profile & Settings.
- `static/app.js` — vanilla JS state management and rendering; no build step, no framework.
- `static/style.css` — pastel theme on CSS variables (tokens live in `.interface-design/system.md`).
- `.interface-design/system.md` — design tokens (sage + cream + peach): palette, radius, spacing, depth, type.
- `data/meals.csv` — meal catalog source of truth; `data/meals.xlsx` regenerated server-side on catalog writes.
- `book/state.json`, `jingjing/state.json`, `meals.json` — the live data **on GitHub** (repo-root paths from `USER_FILES` + `MEALS_FILE`).
- `data/book/state.json`, `data/jingjing/state.json`, `data/meals.json` — local fallback copies (GitHub not configured).
- `vercel.json` — routes everything to `api/index.py`.
- `requirements.txt` — `Flask==3.1.0`, `openpyxl==3.1.5`.
- `.github/workflows/validate.yml` — compiles the `api/` package and JSON-validates the state/shared-meal fallback files.

## Data model

**User state** (`book/state.json`, `jingjing/state.json`):

```json
{
  "name": "BOok",
  "gender": "male",
  "target": 2000,
  "goal": null,
  "age": null,
  "meals": [],
  "logs": {},
  "weights": []
}
```

- `gender` is `"male"` or `"female"`. Defaults: target 2000 (male) / 1600 (female).
- `age` is an optional nullable int (set in Settings) used only for the dashboard health-age estimate.
- `logs`: map of `"YYYY-MM-DD"` → array of meal ids. Planned ids look like `plan-<week>-<meal>-<gender>`; shared ids are `custom-<uuid>`.
- `weights`: array of `{date, weight}`. `goal` nullable. `meals` is legacy (kept for migration, no longer used).
- `normalize_user` (in `api/state.py`) deeply validates/coerces every field (gender enum, numeric target/goal/age, well-formed logs/weights) and never raises.

**Shared meals** (`meals.json`): `{"meals": [{id, name, kcal, protein, carbs, fat}]}` — one library for the whole app. `findMeal(id)` checks shared meals first, then the catalog.

## Backend conventions (`api/`)

- Env vars: `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH` (default `main`), `APP_PASSWORD` (optional). Read in `api/config.py`.
- **GitHub paths are repo-root** (`book/state.json`, `jingjing/state.json`, `meals.json`) via `USER_FILES`/`MEALS_FILE`; `data/` is prepended only for the local fallback.
- **Writes are atomic**: `commit_files()` creates ONE commit for all changed files (both users + shared meals together, or catalog csv+xlsx together). Either all files update or none. On a 409 branch race it re-reads the head and retries once, then surfaces `RuntimeError("CONFLICT")` → the API returns 409.
- `PUT|POST /api/state` accepts `{users, meals?, message}`; only files whose content actually changed are written (no-op saves are skipped).
- Auth: optional shared `APP_PASSWORD` on data endpoints (`check_password`). `GET /api/meal-catalog` and downloads stay open.
- Endpoints: `GET /` (page), `GET /api/config`, `GET /api/state` (`{users, meals}`), `PUT|POST /api/state`, `GET|POST /api/meal-catalog` (GET open), `DELETE /api/meal-catalog`, `GET /download/meals.csv`, `GET /download/meals.xlsx`.
- The browser never receives the GitHub token; all GitHub I/O happens server-side.

## Meal catalog (`data/meals.csv`)

Columns: `week, meal, meal_name, gender, kcal, protein_g, carbs_g, fat_g, ingredients, method`. One row per meal per gender; `ingredients`/`method` are pipe-`|` lists; Thai UTF-8 (`utf-8-sig`). `write_catalog()` persists CSV + XLSX atomically.

## Frontend conventions (`static/app.js`)

- Global `state = {users: {book, jingjing}, meals: [], active_user}`; `KEY = "mealTrackerV4"` for localStorage, `mealTrackerPassword` in sessionStorage.
- **Shared meals**: `state.meals` is app-wide. `loadCloud()` reads `{users, meals}`; legacy per-user `meals` are auto-merged into the shared list once (`migrateSharedMeals`) with a toast. Add/delete operate on `state.meals`; deleting a shared meal also strips its id from **both** users' logs; `clearData` never touches shared meals.
- Keep IDs stable across frontend/backend: user keys, meal ids, catalog rows (`findMeal`, `planMeals`).
- Rendering is imperative (`renderAll` → dashboard/meals/planView/progress/settings); `renderUserSwitch()` at the top of each render; escape user content with `esc()`.
- **Save path (debounced, batched, robust):** `queueSave(msg)` → `migrate()` + `localSave()` immediately, records the action message, restarts a **30s trailing debounce** → `flushSave()`. `flushSave()` sends one `PUT /api/state` with `{users, meals, message}`. On **409** it retries once, then stashes `state` in `localStorage[KEY+"_backup"]`, reloads server state and warns; the Settings "Restore last backup" button re-applies it. A `pagehide` handler flushes pending changes via `fetch(..., keepalive)` (POST). `loadCloud()` clears pending messages on login.
- Precise commit messages per action (e.g. `Log meal "…" for BOok`, `Add meal "…"`, `Log weight 70.2kg for jingjing`); batched actions join with `; `.
- **Health score & health age (rule-based, no AI):** `healthScore()` in `static/app.js` computes a 0–10 score for the active user over the last 7 days from `consistency` (40%), `calorie` adherence (40%) and a `protein` floor (20%, `protein_g×4 ≥ 0.15×kcal`), with short feedback lines. The Dashboard's `#healthCard` renders a `conic-gradient` score ring, three breakdown bars, and `health age ≈ age − round((score−6)×1.5)` (only when `age` is set and ≥1 day logged). Pure derived data — nothing stored.

## UI / design

Pastel "sage + cream + peach" theme. All colors, radius, spacing, depth and type tokens are CSS variables in `static/style.css`, documented in `.interface-design/system.md`. Nunito (Google Fonts) with system fallback; tabular numbers on stats; soft layered shadows (borders only on inputs/dividers); `prefers-reduced-motion` honored. When restyling, keep existing class names/IDs so the imperative JS renderers stay untouched.

## Testing / running locally

There is no test suite. Verify by:
1. `python -m flask --app api/index.py run` from the repo root (no `__main__` block). Flask serves `templates/` and `static/` relative to `api/`.
2. Exercising endpoints with curl (e.g. `GET /api/state`, `PUT /api/state` with `{users, meals, message}`, `POST/DELETE /api/meal-catalog`) against local files when GitHub vars are unset.
3. Checking `data/*.json` + `data/meals.csv`/`data/meals.xlsx` diffs after writes; confirm `data/meals.json` is created on first shared-meal save.

CI (`.github/workflows/validate.yml`) runs `python -m compileall -q api` and JSON-validates the fallback files.

## Deploy

Push to GitHub → import into Vercel → set `GITHUB_TOKEN` (fine-grained, Contents: Read+Write), `GITHUB_REPO`, `GITHUB_BRANCH`, optional `APP_PASSWORD` → deploy. Never commit `credentials/` secrets (`.gitignore` excludes `credentials/`).