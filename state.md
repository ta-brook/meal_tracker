# Meal Tracker — Application State (reference)

Living document for future development. Update this whenever the architecture,
data model, or feature set changes. Source of truth for the current state of
the app; the skill (`.opencode/skills/meal-tracker/SKILL.md`) points here.

## Snapshot

- **What it is now:** a two-person household app (book / jingjing) that grew out
  of a meal tracker — meal logging, meal prep plan, market prices, shared
  shopping list, shared chores, shared calendar + daily mood, shared finance
  with IOU + budgets, weight progress, **health data import (Garmin/Apple Health)**,
  **sleep stage charts**, **activity & vitals dashboard**, **Strava auto-sync**.
- **Stack:** Flask (Python) on Vercel, vanilla-JS single-page frontend, no build
  step, no framework, no test suite. Data persists to GitHub via the Git Data
  API (atomic commits) with a local `data/` fallback.
- **Navigation:** fixed **bottom tab bar** (6 tabs: Home · Meals · Calendar · Plan · Finance · Profile). The previous 11-tab top bar was replaced in Ticket #6.

## Layout

- `api/index.py` — Flask app + all routes, `check_password()`, conflict handling.
- `api/config.py` — env vars, paths, `USER_FILES`, `MEALS_FILE`, `ROOT`, `persistent()`,
  **Strava env vars** (`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_WEBHOOK_VERIFY_TOKEN`).
- `api/github.py` — `gh()`, `get_contents()`, `read_file_text()`,
  `write_files_local()`, `commit_files(changes, message)` (one atomic commit,
  Git Data API; 409 → retry once → `RuntimeError("CONFLICT")`).
- `api/state.py` — user schema + deep validation/coercion (`normalize_user`),
  `empty_user`, `read_user(s)`. **Includes `health.daily` and `import_sources`.**
- `api/meals.py` — shared custom-meal library (`read_meals`, `normalize_meals`, `serialize`).
- `api/catalog.py` — catalog CSV/XLSX (`catalog_source`, `write_catalog`, `normalize_catalog_row`).
- `api/prices.py` — Makro PRO prices: `ITEMS`, `fetch_prices()` (parallel search
  of `search.maknet.siammakro.cloud`), `read_prices()`, `serialize()`.
- `api/shared.py` — household shared data: `SHARED_FILES` (shopping/calendar/
  finance/chores), per-key `read()`/`normalize()`/`serialize()`.
- **`api/import_handlers.py`** — **NEW** — parses Garmin CSV (sleep/activities/weight/HR/steps)
  and Apple Health `export.xml`/`export.zip` (streaming iterparse for large files).
  `parse_csv()`, `parse_apple_health_xml()`, `merge_health_import()`.
- **`api/strava_sync.py`** — **NEW** — Strava OAuth, token refresh, activity fetch,
  webhook processing. `exchange_code()`, `refresh_token()`, `sync_user()`,
  `activity_to_exercise()`, `build_auth_url()`.
- `templates/index.html` — one page, 11 `<section id="...">` pages + top tabs.
  **New: activity card, weekly activity card, sleep stage stacked chart, Strava section.**
- `static/app.js` — imperative state + rendering; feature renderers live here.
  **New: `renderActivity()`, `renderWeeklyActivity()`, `renderStravaStatus()`,
  `importHealthFile()`, updated `healthScore()` with sleep + activity dimensions.**
- `static/style.css` — pastel tokens + components; dark mode via `[data-theme="dark"]`.
  **New: `.sleep-stack`, `.sleep-deep/light/rem/awake`, `.sleep-legend`.**
- `.interface-design/system.md` — design tokens + "Today's plate" signature + dark mode.
- `manifest.json`, `sw.js`, `static/icons/` — PWA.
- `scripts/fetch_makro_prices.py` — refresh `data/prices.json` from Makro PRO.

## Data model

**Per-user `state.json`** (`book/state.json`, `jingjing/state.json`), deep-coerced
by `normalize_user` (never raises):

```json
{
  "name": "book",
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
  "moods": {},
  "health": {"sleep": [], "exercise": [], "daily": {}},
  "import_sources": {},
  "strava": null
}
```

- `logs`: `"YYYY-MM-DD"` → meal id list. `weights`: `[{date, weight}]`.
- `water`: `{date: glasses}`. `moods`: `{date: mood_key}` — keys from
  `MOODS` (`great/good/ok/meh/bad/awful`), per-user, logged on the Mood page.
- `meals` is legacy (migration only, unused). `goal`/`age`/`height`/macro goals nullable.
- **`health.sleep`**: `[{date, score, hours, deep, light, rem, awake}]` — imported sleep records.
- **`health.exercise`**: `[{date, type, duration, distance, calories, hr_avg}]` — imported workouts.
- **`health.daily`**: `{"YYYY-MM-DD": {steps, active_calories, resting_hr, avg_hr, max_hr, min_hr, distance}}` — daily aggregates from imports.
- **`import_sources`**: `{"garmin": "2026-09-22T...", "apple_health": "..."}` — timestamps of last import per source.
- **`strava`**: `{access_token, refresh_token, expires_at, athlete_id}` — OAuth tokens for auto-sync.

**Shared (repo-root on GitHub, `data/` local fallback):**
- `meals.json` — `{"meals": [{id, name, kcal, protein, carbs, fat}]}` (shared library).
- `shopping.json` — `{"items": [{id, name, category: food|home|health, done, added_by}]}`.
- `calendar.json` — `{"events": [{id, title, date, kind: personal|shared, user, note}]}`.
- `finance.json` — `{"transactions": [{id, description, category, amount, paid_by, date, settled}], "budgets": {"YYYY-MM": {category: ฿}}}`.
- `chores.json` — `{"chores": [{id, name, done: {"YYYY-MM-DD": "book"|"jingjing"}}]}`.
- `data/meals.csv` + `data/meals.xlsx` — catalog (week/meal/meal_name/gender/kcal/protein_g/carbs_g/fat_g/ingredients/method; ingredients/method pipe-`|` lists).
- `data/prices.json` — `{updated, items:[{id, category, name, name_en, search, result}]}`.

## Features / pages (bottom tabs)

| Tab | Sections inside | Description |
|---|---|---|
| **Home** | `dashboard` | Day overview: stats, health score card (5-dimensional), calorie bar, macro-goal bars, water, "Activity & Vitals", "Today's plate" (animated), hub cards, today's chores, weekly activity, last-7-days, meals eaten today. |
| **Meals** | `meals` + `prices` | Shared custom meals + editable catalog; search/add/edit/delete. Market Prices (Makro PRO) sub-section. |
| **Calendar** | `calendar` + `mood` | Month grid with events (color-coded),     filters All/Shared/book/jingjing. **Month · List · Mood sub-tabs.** Mood selector + month summary inside the Mood sub-tab. |
| **Plan** | `plan` + `shopping` + `chores` | 4-week prep plan per gender + grocery list (localStorage checks). Shopping list (Food/Home/Health). Shared chores tick-off. |
| **Finance** | `finance` | Red-gradient spending summary card with per-payer totals and frosted pending sub-cards. Monthly per-category budgets. Transaction list with settle/delete. |
| **Profile** | `progress` + `settings` | Weight chart, BMI, goal progress, sleep/exercise charts. Profile settings, macro goals, theme, catalog downloads, JSON backup, health data import, Strava connect, cloud password. |

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
- **`POST /api/import/file`** — **NEW** — upload CSV/ZIP/XML health data (multipart/form:
  `file`, `user`, `source`). Returns `{ok, summary, source}`.
- **`GET /api/strava/auth`** — **NEW** — returns Strava OAuth URL (auth required).
- **`GET /api/strava/callback`** — **NEW** — OAuth callback; stores tokens; redirects to `/?strava=connected#settings`.
- **`POST /api/strava/sync`** — **NEW** — manual sync; body `{user}`; returns `{ok, summary}`.
- **`GET|POST /api/webhook/strava`** — **NEW** — webhook validation (GET) + event receiver (POST).

Auth: optional shared `APP_PASSWORD` via `X-App-Password` header; token never
reaches the browser.

## Health data import

**Supported formats:**
- Garmin Connect CSV exports: sleep, activities, weight, heart rate, steps (auto-detected by column headers).
- Apple Health `export.zip` or `export.xml`: weight, steps, heart rate, active calories,
  distance, workouts, sleep stages. Uses streaming `iterparse` for memory efficiency.

**Merge behavior:** deduplicated by date (sleep), date+type (exercise), date (weights),
  date+metric key (daily counters are summed). Import source timestamps stored in
  `user.import_sources`.

## Strava auto-sync

- Both Garmin and Apple Watch can sync activities to Strava.
- User connects via OAuth; tokens stored per-user in `user.strava`.
- Manual sync button + webhook endpoint for near-real-time updates.
- Strava subscription required as of June 2026.
- Activities are converted to the app's `health.exercise` schema.

## PWA

`manifest.json` (id, shortcuts → `/#page`, icons 192/512), `sw.js` (offline shell:
network-first navigations, cache-first assets, `/api/*` never cached), hash-based
tab routing (`/#meals` etc.), "Install app" button in Settings.

## Design system

Soft muted teal primary (`#5AAFA3` → `#0F3D36` for buttons) on warm off-white canvas. Large-radius cards, soft layered
shadows, clean list rows. Documented in `.interface-design/system.md`.
Nunito + system fallback; tabular numbers on stats; borders only on inputs/dividers;
`prefers-reduced-motion` honored. Dark mode = `[data-theme="dark"]` token overrides
+ header theme toggle (Auto/Light/Dark). Active bottom tab uses `--primary`.
Buttons are solid colors (no gradients), with brightness hover — simple and readable.

**New sleep-stage chart colors:**
- Deep: `#5B6BA8` (dark blue)
- Light: `#8FA4D3` (light blue)
- REM: `#7FBF6E` (green)
- Awake: `#D9A4B0` (pink)

## Conventions

- No comments in code unless asked; match the dense single-line style.
- Keep IDs stable; escape user content with `esc()`; renderers are imperative.
- Backend writes stay atomic (one `commit_files` per logical save).
- Add new features as: new `<section>` + renderer function + (if shared) a key in
  `api/shared.py` `SHARED_FILES`, wired into `tab()`, `renderAll()`, `migrate()`,
  `loadCloud()`, and the save payload.
- **New convention:** health data features add keys to `user.health` and are
  rendered via dedicated `render*()` functions; import features use `api/import_handlers.py`
  for parsing and `merge_health_import()` for deduped merging.

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
- **Garmin direct auto-sync is not possible** — Garmin has no consumer API and
  their partner program is reportedly paused (2026). Strava bridge is the viable
  auto-sync path for workouts.
- **Apple Health auto-sync requires a native iOS app** — HealthKit is on-device only.
  File upload is the practical web-app path.

## Future ideas (not built)

- ~~AI photo → calorie estimation~~ **Obsolete** — removed from roadmap. Vision API costs are prohibitive; manual logging is sufficient.
- Water/sleep/other trackers could extend the existing per-user maps.
- Calorie target adjuster: "eat back" a percentage of active calories burned.
- Trend arrows: week-over-week up/down indicators for weight, steps, sleep.
- Sleep quality correlation: how sleep score affects health score.

## Recent changes (2026-09-24 session)

### Polish & accessibility
- **Distinct `.danger` button** — solid `#C0392B` (was identical to `.primary` gradient)
- **Focus-visible rings** on all interactive buttons (`.primary`, `.secondary`, `.danger`, `.tab`, `.sub-tab`, `.user-btn`, `.close`)
- **`.card:hover` lift** (`translateY(-2px)`) for consistency with `.stat` and `.meal-card`
- **`viewport-fit=cover`** added to viewport meta for proper iPhone safe-area handling

### Tokenization & cleanup
- Tokenized hardcoded colors: `.fin-hero`, `.water-card`, `.mini-progress`
- Added dark-mode sleep stage colors (deep/light/rem/awake)
- Fixed `.price-item` wrapping with `row-gap: 6px`
- Tuned spacing rhythm (`.health-card`, `.dashboard-grid`, `.catalog-card` margins)
- Added `--shadow-primary` and `--shadow-primary-lg` tokens
- Unified `.hub-card` radius to `--r-lg` (26px)
- Bumped `.stat span` labels from 11px to 12px
- Fixed `.profile-strip span` magic margin → `#profileSummary`
- Removed dead `.iou-row` CSS rules
- Added missing `.week-btn` / `.week-buttons` styles
- Removed unused `.fin-item` class from finance template

### Mobile improvements
- **16px font-size** on inputs/selects/textarea in `@media(max-width:760px)` (prevents iOS zoom)
- Larger bottom-nav touch targets (`padding: 9px 2px`)
- Tighter modal padding on mobile (`padding: 22px`)
- Smaller section-head h2 (`font-size: 20px`)

### Color redesign (red/maroon → muted seafoam teal)
- **Primary:** `#D94838` (red) → `#06B6D4` (cyan) → `#5AAFA3` (muted teal) → `#0F3D36` (dark teal for buttons)
- **Accent:** `#E8A87C` (peach) → `#2DD4BF` (mint) → `#8ECFB8` (soft sage)
- **Dark mode:** cyan-tinted → seafoam-tinted tokens
- **Simplified buttons:** removed gradients, removed colored hover shadows, solid colors only
- Updated `theme-color` meta + `manifest.json` theme_color
- Updated `.interface-design/system.md` with new palette

### Commits
`1d4224e` → `c900ad8` → `9b1cf23` → `2fef58c` → `a7136de` → `c6a63db` → `ea512f7` → `e4ff0d0` → `6816f2f` → `0d24164`
