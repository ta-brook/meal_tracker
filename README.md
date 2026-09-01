# Meal Tracker v4 — BOok + jingjing + separate GitHub folders

A simple Flask application for Vercel with two profiles: **BOok** and **jingjing**.

## What changed

- Profile names are **BOok** and **jingjing**.
- Each profile has separate meals, logs, weights, calorie target, goal and quantity profile.
- The UI gives immediate feedback after logging: the button becomes **✓ Logged today** and a toast confirms the save.
- Duplicate logging of the same meal on the same date is prevented.
- Planned meals are linked to the selected week and can be logged with one click.
- Planned meal kcal/macros are stored in an editable catalog at `data/meals.csv`.
- An Excel copy is included at `data/meals.xlsx`.
- The app reads `data/meals.csv`, so future plan/nutrition changes can be made by editing that CSV and redeploying.
- Download buttons in the app provide the CSV and Excel files.

## GitHub storage: yes, it is separate per user

When GitHub persistence is enabled, the app stores the two users as:

```text
data/
├── book/
│   └── state.json
├── jingjing/
│   └── state.json
├── meals.csv
└── meals.xlsx
```

`data/book/state.json` contains only BOok's profile, custom meals, daily meal logs and weights.
`data/jingjing/state.json` contains only jingjing's corresponding data.

The Python API reads/writes each file through the GitHub Contents API. The browser never receives the GitHub token.

## APP_PASSWORD

`APP_PASSWORD` is an optional shared password for the application. It is not your GitHub or Vercel password. Both BOok and jingjing can use the same app password, then switch profiles.

If you leave it unset, there is no app-password layer. For a private app, you may still want to set a long random value.

## Vercel environment variables

```text
GITHUB_TOKEN=your_fine_grained_github_token
GITHUB_REPO=yourname/meal-tracker
GITHUB_BRANCH=main
APP_PASSWORD=your_shared_app_password   # optional
```

There is no longer a `GITHUB_DATA_PATH` setting because the API deliberately manages the two fixed user paths.

## GitHub token permissions

Create a fine-grained token restricted to this repository and grant repository **Contents: Read and write** permission.

## Meal catalog editing

`data/meals.csv` is the source used by the running application. It has one row for each planned meal and gender quantity profile.

Columns:

```text
week, meal, meal_name, gender, kcal, protein_g, carbs_g, fat_g, ingredients, method
```

Edit the CSV, commit it to GitHub, and redeploy Vercel. `data/meals.xlsx` is a convenient spreadsheet copy; after changing it, export/save the edited sheet as CSV to keep the app's source data synchronized.

## Deploy

1. Push the project to GitHub.
2. Import it into Vercel.
3. Add the environment variables above.
4. Deploy.

Without GitHub variables, the app can run locally using the two JSON files, but Vercel's serverless filesystem is not durable, so use GitHub persistence for the hosted version.
