# Meal Tracker — Interface System

Cyan / teal primary on warm off-white. Evolved from the red/maroon Ticket #6 redesign into a fresher blue-green palette.

## Intent

- **Human:** a couple (book, jingjing) logging meals and weights daily on desktop and phone — quick taps, calm glance.
- **Feel:** warm, fresh, easy on the eyes. Soft like a food journal, not a dashboard.
- **Signature:** cyan primary, large rounded cards, fixed bottom tab bar, cyan-gradient finance summary, calendar with Month/List/Mood sub-tabs.

## Tokens (light mode)

| Token | Value | Notes |
|---|---|---|
| `--bg` | `#FAF6F2` | warm off-white canvas |
| `--surface` | `#FFFFFF` | cards, modal |
| `--surface-soft` | `#F5EFEA` | list items, profile strip |
| `--surface-tint` | `#EDE4DC` | track fills, insets |
| `--primary` | `#06B6D4` | cyan — active tab, brand, buttons |
| `--primary-deep` | `#0E7490` | deep teal — headings, hero numbers |
| `--primary-soft` | `#CFFAFE` | soft cyan tint — tab hover, tags, ingredient chips |
| `--accent` | `#2DD4BF` | mint-teal — progress bars, gradients |
| `--book` / `--book-soft` | `#AEC3E0` / `#E4EDF8` | book active pill |
| `--jingjing` / `--jingjing-soft` | `#E8B89E` / `#F9E7DC` | jingjing active pill |
| `--text` | `#3B312E` | warm dark ink |
| `--muted` | `#8B7D78` | secondary text |
| `--border` | `rgba(70,45,38,.08)` | low-opacity, soft |
| `--success` / deep | `#D9E8D3` / `#4F7A4C` | logged state |
| `--warning` / deep | `#F3E2C4` / `#9A7528` | banner warn |
| `--danger` / deep | `#E8B9B0` / `#A93226` | delete, clear |
| shadows | `--shadow-sm`/`--shadow`/`--shadow-lg` | layered soft, no hard borders for elevation |

## Dark mode

`[data-theme="dark"]` in `static/style.css` overrides the same token variables
(cyan-tinted surfaces, light cyan ink), so every component flips automatically.
Selection via Settings → Appearance (Auto / Light / Dark), defaulting to the
system `prefers-color-scheme`; choice stored in localStorage.

## Bottom tab bar

Fixed at viewport bottom. 6 tabs: Home · Meals · Calendar · Plan · Finance · Profile.
Active tab = cyan icon + label with a subtle indicator dot. Inactive = muted gray.
`env(safe-area-inset-bottom)` padding for notched phones.

## Calendar sub-tabs

Inside the Calendar page: **Month · List · Mood** pill sub-tabs toggle between the
month grid, the events list, and the mood selector/month summary. Implemented with
`.sub-tab` / `.sub-pane` classes and a small JS toggle.

## Finance summary card

`.fin-hero` uses a cyan gradient (`#06B6D4 → #0E7490`), white text, large total
spending number, per-payer sub-totals, and frosted pending sub-cards
(`rgba(255,255,255,.18)` with `backdrop-filter`).

## Today's plate (dashboard signature)

"Today's plate" fills with a food emoji per logged meal — your plate reflects
your day. `--p` conic ring around it shows calorie % of target (reuses
`--primary`/`--surface-tint`). Motion: emojis pop in `foodPop` (0.3s,
`cubic-bezier(.23,1,.32,1)`, stagger 60ms, only when the meal count changes);
the ring gently floats `plateFloat` (4.5s ease-in-out) while food is present.
All motion dies under `prefers-reduced-motion`. Sizes: ring 160 / inner plate 126.

## Decisions

- **Depth strategy:** subtle layered shadows for elevation; real borders only on inputs + dividers (`--border`). Never harsh borders.
- **Spacing base:** 8px grid; cards `20px` padding, section gaps `12–22px`.
- **Radius scale:** inputs/buttons `12`, cards `18–26`, modal `26`.
- **Type:** Nunito (Google Fonts) + system fallback; body `15px/1.6`; headings `700–800`, tight tracking (`-0.01em`); labels `12px` uppercase tracked on stats.
- **Numbers:** `font-variant-numeric: tabular-nums` on all stats/calorie values.
- **Motion:** `cubic-bezier(.23,1,.32,1)`, 120–300ms, transform/opacity only, press `scale(.97)`, `prefers-reduced-motion` honored.
- **Semantic color is scarce:** gray builds structure; cyan = brand/active; mint = progress; soft blue/peach = user identity; pastel red/amber = destructive/warn.

## Component patterns

- **Button primary** — 40px h · 11px 18px pad · `--r-sm` (12) · 14px/700 · `--primary-deep` bg, white text.
- **Pill user switch** — radius 999px, `9px 16px`, 13px/600; active = tinted soft bg + colored border.
- **Meal card** — `--surface`, `--r-lg` (26), `20px` pad, `--shadow-sm`, one cyan tag + macro line.
- **Stat** — uppercase 12px label, 30px/800 tabular value, muted small.
- **Bottom nav tab** — flex column, 22px icon + 11px label, active cyan with dot indicator.
