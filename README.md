# Meal Tracker v4 — BOok + jingjing + shared meal library

A simple Flask application for Vercel with two profiles: **BOok** and **jingjing**.

## Highlights

- Profile names are **BOok** and **jingjing**; each profile keeps its own logs, weights, calorie target, goal and quantity profile.
- **Custom meals are shared across the whole app** (one library for both profiles), stored in `meals.json`.
- Planned meals come from the editable catalog at `data/meals.csv` (read at runtime) with a regenerated Excel copy at `data/meals.xlsx`.
- **Saves are batched**: changes are applied locally immediately and flushed to GitHub once, 30 seconds after the last click (not on every click), with descriptive commit messages.
- **Robust storage**: user data is validated/coerced server-side, and all changed files are written in a single atomic commit via the GitHub Git Data API (all-or-nothing). On a conflict the app retries once, then keeps a local backup.
- **7-Day Health score + Health Age**: a rule-based 0–10 weekly score (consistency, calorie adherence, protein floor) with short feedback, plus an estimated "health age" (set your age in Profile & Settings). No AI, no API keys.
- Pastel "sage + cream + peach" UI (tokens in `.interface-design/system.md`).

## GitHub storage

When GitHub persistence is enabled, the app stores the two users and the shared meal library as:

```text
book/state.json        # BOok's profile, logs, weights
jingjing/state.json    # jingjing's profile, logs, weights
meals.json             # shared custom-meal library (both profiles)
data/meals.csv         # planned-meal catalog source of truth
data/meals.xlsx        # regenerated spreadsheet copy
```

`data/book/state.json`, `data/jingjing/state.json` and `data/meals.json` are local fallback copies used only when GitHub isn't configured.

The Python API reads/writes files through the GitHub Contents / Git Data APIs. The browser never receives the GitHub token.

## Save & commit behavior

- Every action updates the UI and `localStorage` instantly.
- A 30-second trailing debounce batches edits; one `PUT /api/state` carries `{users, meals, message}`.
- The backend writes only the files that actually changed, in **one atomic commit** (Git Data API) — either all files update or none.
- Commit messages describe the change, e.g. `Log meal "กะเพราอกไก่บด" for BOok`, `Add meal "…"`, `Log weight 70.2kg for jingjing`.

## APP_PASSWORD

`APP_PASSWORD` is an optional shared password for the application (not your GitHub or Vercel password). Both profiles use the same app password, then switch profiles. If unset there is no app-password layer.

## Vercel environment variables

```text
GITHUB_TOKEN=your_fine_grained_github_token
GITHUB_REPO=yourname/meal-tracker
GITHUB_BRANCH=main
APP_PASSWORD=your_shared_app_password   # optional
```

The API deliberately manages fixed paths (`book/state.json`, `jingjing/state.json`, `meals.json`); there is no configurable data-path setting.

## GitHub token permissions

Create a fine-grained token restricted to this repository and grant repository **Contents: Read and write** permission (also covers the Git Data API).

## Meal catalog editing

`data/meals.csv` is the source used by the running application — one row per planned meal and gender quantity profile:

```text
week, meal, meal_name, gender, kcal, protein_g, carbs_g, fat_g, ingredients, method
```

Edit the CSV, commit it to GitHub, and redeploy Vercel. `data/meals.xlsx` is regenerated automatically whenever the catalog is written through the app.

## Deploy

1. Push the project to GitHub.
2. Import it into Vercel.
3. Add the environment variables above.
4. Deploy.

Without GitHub variables, the app runs locally using the JSON/CSV fallback files, but Vercel's serverless filesystem is not durable — use GitHub persistence for the hosted version.

## Development

```bash
python -m flask --app api/index.py run
```

CI (`.github/workflows/validate.yml`) compiles the `api/` package and JSON-validates the state/shared-meal fallback files. Requirements: `Flask==3.1.0`, `openpyxl==3.1.5`.