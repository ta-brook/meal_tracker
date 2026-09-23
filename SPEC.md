# Meal Tracker — UI/UX Redesign Spec (Ticket #6)

User-provided reference: 5 screenshots of a couple's home-management app
("Our Homie" look). Scope is **UI/UX only — no feature changes, no data-model
changes**. All existing data and functionality stays identical; the visual
language, navigation structure, and page composition change.

## Decisions (confirmed with user, interactive session)

| Question | Decision |
|---|---|
| Tab mapping | Rename tabs to fit Meal Tracker (6 tabs) |
| "Pet" tab | Replaced with an existing feature tab |
| Shopping tab content | Shopping list (checkbox items) — keep current feature |
| Branding | Keep **"Meal Tracker"** (adopt styling only) |

## Target visual language

- **Primary:** deep red / maroon (from the finance card + buttons in the
  reference images).
- **Background:** very light warm off-white/gray.
- **Surfaces:** pure white cards, large radius, soft layered shadows.
- **Navigation:** fixed **bottom tab bar** (replaces the 11-tab top bar),
  active state = red icon + label.
- **Headers:** per-page top header with title + action pills (e.g. `Shared | Personal`).
- **Lists:** clean rows with icon/avatar circle, title, subtitle, trailing
  action (checkmark / amount / delete).
- **Finance:** large red gradient summary card, per-payer progress bars,
  frosted pending sub-cards, category budget rows with red progress bars.
- **Calendar + Mood:** combined page with `Month · List · Mood` sub-tabs and a
  mood selector row of styled emoji circles.

## 6 Bottom Tabs → feature mapping

| Tab | Features inside |
|---|---|
| **Home** | Dashboard: stat cards, health score ring, today's plate, water, macro bars, weekly summary, activity/vitals, today's meals, hub links |
| **Meals** | Shared meal library + catalog + **Prices** (as a sub-section / stacked cards) |
| **Calendar** | Calendar + Mood (sub-tabs: Month · List · Mood) |
| **Plan** | 4-week prep plan + grocery list + **Shopping** + **Chores** |
| **Finance** | Spending summary card, IOU, budgets, transactions |
| **Profile** | Progress (weight/sleep/exercise) + Settings (profile, imports, Strava, cloud) |

Pages currently at top level that move into a tab: Prices → Meals;
Shopping/Chores → Plan; Mood → Calendar; Progress/Settings → Profile.
Dashboard stays Home.

## Implementation notes

- Pure CSS + HTML restructure + minimal `app.js` routing changes (tab ids,
  renderer calls, bottom-nav active states, hash sync). No backend changes.
- Keep existing element IDs so imperative renderers keep working where possible.
- Update design tokens in `static/style.css` + `.interface-design/system.md`.
- Dark mode = token-only overrides, same as today.
- Mobile-first; `@media(max-width:760px)` tuned; desktop keeps a sane max-width.
- Keep `prefers-reduced-motion` support.

## Files touched

- `templates/index.html` — shell, bottom nav, page sections reorganized.
- `static/style.css` — full restyle (tokens + components + dark mode).
- `static/app.js` — tab routing, new renderers/composition for moved pages.
- `.interface-design/system.md` — updated tokens + component patterns.
- `state.md`, `TASKS.md`, this file — docs kept in sync.