# Meal Tracker — Application State (reference)

Living document for future development. Update this whenever the architecture,
data model, or feature set changes. Source of truth for the current state of
the app; the skill (`.opencode/skills/meal-tracker/SKILL.md`) points here.

## Snapshot

- **What it is now:** a two-person household app (BOok / jingjing) that grew out
  of a meal tracker — meal logging, meal prep plan, market prices, shared
  shopping list, shared chores, shared calendar + daily mood, shared finance
  with IOU + budgets, weight progress.
- **Stack:** Flask (Python) on Vercel, vanilla-JS single-page frontend, no build
  step, no framework, no test suite. Data persists to GitHub via the Git Data
  API (atomic commits) with a local `data/` fallback.
- **Navigation:** classic top horizontal tab bar (`.tabs`), 11 tabs.
  (A bottom tab bar was tried and **reverted** — `e5b11ff`.)

## Layout

- `api/index.py` — Flask app + all routes, `check_password()`, conflict handling.
- `api/config.py` — env vars, paths, `USER_FILES`, `MEALS_FILE`, `ROOT`, `persistent()`.
- `api/github.py` — `gh()`, `get_contents()`, `read_file_text()`,
  `write_files_local()`, `commit_files(changes, message)` (one atomic commit,
  Git Data API; 409 → retry once → `RuntimeError("CONFLICT")`).
- `api/state.py` — user schema + deep validation/coercion (`normalize_user`),
  `empty_user`, `read_user(s)`.
- `api/meals.py` — shared custom-meal library (`read_meals`, `normalize_meals`, `serialize`).
- `api/catalog.py` — catalog CSV/XLSX (`catalog_source`, `write_catalog`, `normalize_catalog_row`).
- `api/prices.py` — Makro PRO prices: `ITEMS`, `fetch_prices()` (parallel search
  of `search.maknet.siammakro.cloud`), `read_prices()`, `serialize()`.
- `api/shared.py` — household shared data: `SHARED_FILES` (shopping/calendar/
  finance/chores), per-key `read()`/`normalize()`/`serialize()`.
- `templates/index.html` — one page, 11 `<section id="...">` pages + top tabs.
- `static/app.js` — imperative state + rendering; feature renderers live here.
- `static/style.css` — pastel tokens + components; dark mode via `[data-theme="dark"]`.
- `.interface-design/system.md` — design tokens + "Today's plate" signature + dark mode.
- `manifest.json`, `sw.js`, `static/icons/` — PWA.
- `scripts/fetch_makro_prices.py` — refresh `data/prices.json` from Makro PRO.

## Data model

**Per-user `state.json`** (`book/state.json`, `jingjing/state.json`), deep-coerced
by `normalize_user` (never raises):

```json
{
  "name": "BOok",
  "gender": "male",
  "target": 2000,
  "goal": null,
  "age": null,
  "height": null,
  "protein_goal": null, "carbs_goal": null, "fat_goal": null,
  "meals": [],
  "logs": {},
  "weights": [],
  "water": {},
  "moods": {}
}
```

- `logs`: `"YYYY-MM-DD"` → meal id list. `weights`: `[{date, weight}]`.
- `water`: `{date: glasses}`. `moods`: `{date: mood_key}` — keys from
  `MOODS` (`great/good/ok/meh/bad/awful`), per-user, logged on the Mood page.
- `meals` is legacy (migration only, unused). `goal`/`age`/`height`/macro goals nullable.

**Shared (repo-root on GitHub, `data/` local fallback):**
- `meals.json` — `{"meals": [{id, name, kcal, protein, carbs, fat}]}` (shared library).
- `shopping.json` — `{"items": [{id, name, category: food|home|health, done, added_by}]}`.
- `calendar.json` — `{"events": [{id, title, date, kind: personal|shared, user, note}]}`.
- `finance.json` — `{"transactions": [{id, description, category, amount, paid_by, date, settled}], "budgets": {"YYYY-MM": {category: ฿}}}`.
- `chores.json` — `{"chores": [{id, name, done: {"YYYY-MM-DD": "book"|"jingjing"}}]}`.
- `data/meals.csv` + `data/meals.xlsx` — catalog (week/meal/meal_name/gender/kcal/protein_g/carbs_g/fat_g/ingredients/method; ingredients/method pipe-`|` lists).
- `data/prices.json` — `{updated, items:[{id, category, name, name_en, search, result}]}`.

## Features / pages (top tabs)

1. **Home** (`dashboard`) — day overview: stats, health score card, calorie bar,
   macro-goal bars, water, "Today's plate" (animated), hub cards linking to each
   section, "Today's chores" card, last-7-days, meals eaten today.
2. **Meals** — shared custom meals + editable catalog; add/edit/delete + search.
3. **Plan** — 4-week prep plan per gender + grocery list (localStorage checks).
4. **Prices** — Makro PRO snapshot grouped by meat/veg/staples + Refresh (GitHub mode).
5. **Shopping** — shared list in Food/Home/Health; add/check/delete; shows who added.
6. **Chores** — shared chores; tick off who did what today.
7. **Calendar** — month grid; events color-coded (shared=sage, personal=user color);
   filters All/Shared/BOok/jingjing.
8. **Mood** — per-user 6-level emoji log + color-coded month summary.
9. **Finance** — IOU (net unsettled by payer), monthly per-category budgets
   (auto-deducted), transaction list with settle/delete.
10. **Progress** — weight chart, BMI, goal progress.
11. **Settings** — profile/targets/macro goals/height, theme, catalog downloads,
    JSON backup export/import, cloud password, clear data.

## Save & sync

- `queueSave(msg)` → `migrate()` + `localSave()` immediately, 30s debounce →
  `flushSave()` sends one `PUT /api/state` with
  `{users, meals, shopping, calendar, finance, chores, message}`.
- Server writes **only changed files** atomically in **one commit**; 409 → retry
  once → backup to `localStorage[KEY+"_backup"]` → reload server state.
- `pagehide` flushes via `keepalive` POST. `loadCloud()` replaces all slices on login.
- **25s polling** (persistent + nothing unsaved) re-fetches `/api/state` and
  re-renders if any shared slice changed — this gives near-real-time sharing.

## Endpoints

- `GET /` (page), `GET /sw.js`, `GET /manifest.json`
- `GET /api/config` — `{auth, persistent, storage}`
- `GET /api/state` — `{users, meals, shopping, calendar, finance, chores}` (auth)
- `PUT|POST /api/state` — atomic write of any changed file (auth)
- `GET|POST /api/meal-catalog`, `PUT /api/meal-catalog`, `DELETE /api/meal-catalog` (GET open; rest auth)
- `GET /api/prices` (open), `POST /api/prices/refresh` (auth + GitHub only)
- `GET /download/meals.csv`, `GET /download/meals.xlsx`

Auth: optional shared `APP_PASSWORD` via `X-App-Password` header; token never
reaches the browser.

## PWA

`manifest.json` (id, shortcuts → `/#page`, icons 192/512), `sw.js` (offline shell:
network-first for everything same-origin — navigations, app shell and static assets —
falling back to cache offline; `/api/*` never cached). Network-first assets (not
cache-first) keep the installed PWA from pinning stale `app.js`/`style.css` after a
deploy; bump the `CACHE` name in `sw.js` when a breaking asset change still lingers.
Hash-based tab routing (`/#meals` etc.), "Install app" button in Settings.

## Design system

Pastel sage + cream + peach tokens in `static/style.css` (documented in
`.interface-design/system.md`). Nunito + system fallback; tabular numbers on
stats; soft layered shadows; borders only on inputs/dividers; `prefers-reduced-motion`
honored. Dark mode = `[data-theme="dark"]` token overrides + header theme toggle
(Auto/Light/Dark). Active top tab uses `--primary`.

## Conventions

- No comments in code unless asked; match the dense single-line style.
- Keep IDs stable; escape user content with `esc()`; renderers are imperative.
- Backend writes stay atomic (one `commit_files` per logical save).
- Add new features as: new `<section>` + renderer function + (if shared) a key in
  `api/shared.py` `SHARED_FILES`, wired into `tab()`, `renderAll()`, `migrate()`,
  `loadCloud()`, and the save payload.

## Verification (no test suite)

1. `python -m compileall -q api`
2. `node --check static/app.js`
3. HTML balance + element-ID cross-check (`app.js` `$("...")` ids exist in `index.html`).
4. Local server: `python -m flask --app api/index.py run`; curl `GET /api/state`,
   `PUT /api/state` round-trips, `GET/POST/DELETE/PUT /api/meal-catalog`, `GET /api/prices`.
5. Check `data/*.json` diffs after writes; clean up test data before committing.

## Known decisions / tradeoffs

- **Atomic single-commit saves** over per-feature endpoints — one `PUT /api/state`
  carries everything; conflict handling is centralized.
- **Polling** (25s) instead of websockets — Vercel serverless; near-real-time is enough.
- **GitHub as database** — durable + free, but commit-count/latency limits apply.
- **Bottom nav tried and reverted** (`e5b11ff`) — kept the top tab bar.
- **Prices scrape** uses Makro PRO's search API; may break if their API changes.
- Grocery-list checkboxes are localStorage-only (not server state).

## Future ideas (not built)

- AI photo → calorie estimation (needs vision API key + server proxy; noted only).
- Water/sleep/other trackers could extend the existing per-user maps.