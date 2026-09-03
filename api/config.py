import os

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_REPO = os.getenv("GITHUB_REPO")
GITHUB_BRANCH = os.getenv("GITHUB_BRANCH", "main")
APP_PASSWORD = os.getenv("APP_PASSWORD")

DATA_ROOT = os.path.join(os.path.dirname(__file__), "..", "data")

USER_FILES = {
    "book": "book/state.json",
    "jingjing": "jingjing/state.json",
}

# Shared custom-meal library (app-wide, not per user). Repo-root on GitHub,
# data/ for the local fallback.
MEALS_FILE = "meals.json"
MEALS_LOCAL = os.path.join(DATA_ROOT, "meals.json")

CATALOG_CSV = os.path.join(DATA_ROOT, "meals.csv")
CATALOG_XLSX = os.path.join(DATA_ROOT, "meals.xlsx")
CATALOG_HEADERS = ["week", "meal", "meal_name", "gender", "kcal", "protein_g", "carbs_g", "fat_g", "ingredients", "method"]


def persistent():
    return bool(GITHUB_TOKEN and GITHUB_REPO)