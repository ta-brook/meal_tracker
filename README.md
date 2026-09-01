# Meal Tracker — Python + Vercel

A deliberately simple Flask/Vercel app based on the supplied `meal_prep.html`.

Features:
- Original 4-week meal plan with male/female quantities
- Add custom meals
- Log meals by date
- Daily calories + protein/carbs/fat
- Calorie target
- Weight history, current/goal/change/7-day average
- Browser-only localStorage, so no paid database is needed

The supplied HTML does not provide kcal/macros, so the app does not invent them. Enter nutrition values when creating a meal.

## Deploy
Push this folder to GitHub → import into Vercel → Deploy.

## Local
`pip install -r requirements.txt`
`flask --app api.index run`
