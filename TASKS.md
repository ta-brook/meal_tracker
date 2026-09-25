# Task Tracker

## Ticket #1 — Mark AI Photo Calorie Estimation as Obsolete
- **Status:** DONE ✅
- **GitHub Issue:** #1 (created & closed)
- **Priority:** High
- **Description:** Update project docs to mark AI photo → calorie estimation as obsolete/won't implement due to vision API costs.
- **Files:** `state.md`, `.opencode/skills/meal-tracker/SKILL.md`

## Ticket #2 — Fix PWA Service Worker Stale JS Bug
- **Status:** DONE ✅
- **GitHub Issue:** #2 (created & closed)
- **Priority:** High
- **Description:** Service worker serves JS/CSS cache-first, causing returning visitors to get stale assets. Buttons (chore/event/expense/meal) silently fail. Switch to network-first for assets.
- **Files:** `sw.js`

## Ticket #3 — Apple Health / Garmin Data Import
- **Status:** DONE ✅
- **GitHub Issue:** #3 (created & closed)
- **Priority:** High
- **Description:** Add manual CSV import for sleep and exercise data from Apple Health / Garmin Connect. No direct API access possible for web apps.
- **Files:** `static/app.js`, `templates/index.html`, `api/index.py` (new endpoint)

## Ticket #4 — New Visual Redesign
- **Status:** DONE ✅
- **GitHub Issue:** #4 (created & closed)
- **Priority:** High
- **Description:** Refresh UI visual design. User mentioned an image reference but none was found in repo. Design a refined pastel dashboard with improved hierarchy, spacing, and visual polish.
- **Files:** `static/style.css`, `templates/index.html`, `static/app.js`

## Ticket #5 — Test All Changes
- **Status:** DONE ✅
- **Priority:** Medium
- **Description:** Run local Flask server, verify all pages render without JS errors, test save/sync, test CSV import.

## Ticket #6 — UI/UX Redesign (bottom nav + new visual language)
- **Status:** DONE ✅
- **GitHub Issue:** #6 (created & closed)
- **Priority:** High
- **Description:** Restyle the app to match the user-provided "Our Homie" reference (UI only, no feature changes). New bottom tab bar (Home · Meals · Calendar · Plan · Finance · Profile), deep red/maroon primary, larger cards, Calendar+Mood merged with Month/List/Mood sub-tabs, Finance gradient summary card, clean list rows.
- **Spec:** `SPEC.md`
- **Files:** `templates/index.html`, `static/style.css`, `static/app.js`, `.interface-design/system.md`, `state.md`

## Ticket #7 — Per-User Login Page
- **Status:** DONE ✅
- **GitHub Issue:** #7 (created)
- **Priority:** High
- **Description:** Add a proper login screen with profile selection (book / jingjing) and per-user password auth. Keep APP_PASSWORD as master fallback. Remember-me via localStorage.
- **Spec:** `SPEC.md`
- **Files:** `api/config.py`, `api/index.py`, `templates/index.html`, `static/app.js`, `static/style.css`, `state.md`

## Ticket #8 — Pixel Companion (Dark Lord Walker)
- **Status:** DONE ✅
- **Priority:** Low
- **Description:** Add an optional draggable pixel-art character that wanders above the bottom nav. Uses static rotation frames + walking GIF. Hidden by default, toggle in Settings.
- **Files:** `static/app.js`, `static/style.css`, `templates/index.html`, `static/assets/walker/`

## Ticket #9 — Weekly Nutrition Summary + Trend Arrows
- **Status:** DONE ✅
- **Priority:** Medium
- **Description:** Add 7-day nutrition averages on Home dashboard with week-over-week trend arrows (↑↓%). Also add trend arrows to weekly activity (steps, sleep) and weight progress.
- **Files:** `static/app.js`, `templates/index.html`
