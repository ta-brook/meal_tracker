# Meal Tracker — Interface System

Pastel, calm, kitchen-fresh UI for a two-person meal-logging app. Direction confirmed with the user: **sage + cream + peach**.

## Intent

- **Human:** a couple (BOok, jingjing) logging meals and weights daily on desktop and phone — quick taps, calm glance.
- **Feel:** warm, fresh, easy on the eyes. Soft like a food journal, not a dashboard.
- **Signature:** pastel pill user-switch (soft blue BOok / soft peach jingjing), sage "Meal x" tags, cream surfaces, rounded friendly type.

## Tokens (light mode only)

| Token | Value | Notes |
|---|---|---|
| `--bg` | `#FBF8F4` | warm cream canvas |
| `--surface` | `#FFFFFF` | cards, modal |
| `--surface-soft` | `#F6F0E7` | list items, profile strip |
| `--surface-tint` | `#EFE8DC` | track fills, insets |
| `--primary` | `#9DBB93` | sage — active tab, brand |
| `--primary-deep` | `#5F7E5B` | primary buttons, headings, hero numbers |
| `--primary-soft` | `#E9F0E4` | tab hover, ingredient chips, tags |
| `--peach` | `#F2D8C6` | secondary accent, progress bars |
| `--peach-deep` | `#D9A47F` | progress fills, mini-bars |
| `--book` / `--book-soft` | `#B9CEE8` / `#E8F0FA` | BOok active pill |
| `--jingjing` / `--jingjing-soft` | `#F2C9B3` / `#FCEFEA` | jingjing active pill |
| `--text` | `#454F46` | deep sage-gray ink |
| `--muted` | `#8C958E` | secondary text |
| `--border` | `rgba(60,70,60,.08)` | low-opacity, soft |
| `--success` / deep | `#DCE8D4` / `#5F7E5B` | logged state |
| `--warning` / deep | `#F3E2C4` / `#A9792B` | banner warn |
| `--danger` / deep | `#F3C9C3` / `#A94F3B` | delete, clear |
| shadows | `--shadow-sm`/`--shadow`/`--shadow-lg` | layered soft, no hard borders for elevation |

## Decisions

- **Depth strategy:** subtle layered shadows for elevation; real borders only on inputs + dividers (`--border`). Never harsh borders.
- **Spacing base:** 8px grid; cards `18–20px` padding, section gaps `12–22px`.
- **Radius scale:** inputs/buttons `10`, cards `18`, modal `24`.
- **Type:** Nunito (Google Fonts) + system fallback; body `15px/1.6`; headings `700–800`, tight tracking (`-0.01em`); labels `12px` uppercase tracked on stats.
- **Numbers:** `font-variant-numeric: tabular-nums` on all stats/calorie values.
- **Motion:** `cubic-bezier(.23,1,.32,1)`, 120–300ms, transform/opacity only, press `scale(.97)`, `prefers-reduced-motion` honored.
- **Semantic color is scarce:** gray builds structure; sage = brand/active; peach = progress; soft blue/peach = user identity; pastel red/amber = destructive/warn.

## Component patterns

- **Button primary** — 40px h · 10px 16px pad · `--r-sm` (10) · 14px/700 · `--primary-deep` bg, white text.
- **Pill user switch** — radius 999px, `8px 14px`, 13px/600; active = tinted soft bg + colored border.
- **Meal card** — `--surface`, `--r-md` (18), `18px` pad, `--shadow-sm`, one sage tag + macro line.
- **Stat** — uppercase 12px label, 30px/800 tabular value, muted small.