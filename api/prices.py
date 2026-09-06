import json
import os
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from api import config, github

SEARCH_URL = "https://search.maknet.siammakro.cloud/search/api/v1/indexes/products/search"

PRICES_LOCAL = os.path.join(config.DATA_ROOT, "prices.json")
PRICES_GIT = "data/prices.json"

ITEMS = [
    {"id": "chicken-breast", "category": "meat", "name": "อกไก่", "name_en": "Chicken breast", "search": "อกไก่"},
    {"id": "chicken-tenderloin", "category": "meat", "name": "สันในไก่", "name_en": "Chicken tenderloin", "search": "สันในไก่"},
    {"id": "minced-chicken", "category": "meat", "name": "ไก่บด", "name_en": "Minced chicken", "search": "ไก่บด"},
    {"id": "minced-pork", "category": "meat", "name": "หมูบด", "name_en": "Minced pork", "search": "เนื้อหมูบด"},
    {"id": "pork-loin", "category": "meat", "name": "สันในหมู", "name_en": "Pork loin", "search": "สันในหมู"},
    {"id": "eggs", "category": "meat", "name": "ไข่ไก่", "name_en": "Eggs", "search": "ไข่ไก่"},
    {"id": "shrimp", "category": "meat", "name": "กุ้ง", "name_en": "Shrimp", "search": "กุ้ง"},
    {"id": "fish", "category": "meat", "name": "เนื้อปลา", "name_en": "Fish", "search": "เนื้อปลา"},
    {"id": "holy-basil", "category": "veg", "name": "ใบกะเพรา", "name_en": "Holy basil", "search": "ใบกะเพรา"},
    {"id": "garlic", "category": "veg", "name": "กระเทียม", "name_en": "Garlic", "search": "กระเทียม"},
    {"id": "bird-chili", "category": "veg", "name": "พริกขี้หนู", "name_en": "Bird chili", "search": "พริกขี้หนู"},
    {"id": "bell-pepper", "category": "veg", "name": "พริกหวาน", "name_en": "Bell pepper", "search": "พริกหวาน"},
    {"id": "onion", "category": "veg", "name": "หอมหัวใหญ่", "name_en": "Onion", "search": "หอมหัวใหญ่"},
    {"id": "broccoli", "category": "veg", "name": "บรอกโคลี", "name_en": "Broccoli", "search": "บรอกโคลี"},
    {"id": "carrot", "category": "veg", "name": "แครอท", "name_en": "Carrot", "search": "แครอท"},
    {"id": "cabbage", "category": "veg", "name": "กะหล่ำปลี", "name_en": "Cabbage", "search": "กะหล่ำปลี"},
    {"id": "tomato", "category": "veg", "name": "มะเขือเทศ", "name_en": "Tomato", "search": "มะเขือเทศ"},
    {"id": "sweet-potato", "category": "veg", "name": "มันเทศ", "name_en": "Sweet potato", "search": "มันเทศ"},
    {"id": "riceberry", "category": "staple", "name": "ข้าวไรซ์เบอร์รี่", "name_en": "Riceberry rice", "search": "ข้าวไรซ์เบอร์รี่"},
    {"id": "jasmine-rice", "category": "staple", "name": "ข้าวหอมมะลิ", "name_en": "Jasmine rice", "search": "ข้าวหอมมะลิ"},
    {"id": "oyster-sauce", "category": "staple", "name": "ซอสหอยนางรม", "name_en": "Oyster sauce", "search": "ซอสหอยนางรม"},
    {"id": "cooking-oil", "category": "staple", "name": "น้ำมันประกอบอาหาร", "name_en": "Cooking oil", "search": "น้ำมันพืช"},
]


def _search_one(q):
    payload = json.dumps({"q": q, "hitsPerPage": 5}).encode()
    req = urllib.request.Request(SEARCH_URL, data=payload, method="POST", headers={
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        "Origin": "https://www.makro.pro",
        "Referer": "https://www.makro.pro/",
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read().decode())
    for hit in data.get("hits") or []:
        if not hit.get("inStock"):
            continue
        doc = hit.get("document") or {}
        price = doc.get("displayPrice")
        if isinstance(price, list):
            price = price[0] if price else None
        return {
            "title": doc.get("title") or doc.get("titleEn") or "",
            "title_en": doc.get("titleEn") or "",
            "price": price,
            "original_price": doc.get("originalPrice"),
            "unit": doc.get("unitSize") or "",
            "category": doc.get("deepestCategory") or "",
            "in_stock": True,
        }
    return None


def fetch_prices():
    """Query Makro PRO search API for every tracked item, in parallel."""
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(_search_one, [it["search"] for it in ITEMS]))
    items = []
    for it, res in zip(ITEMS, results):
        item = dict(it)
        item["result"] = res
        items.append(item)
    return {"updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "items": items}


def read_prices():
    """Return the saved prices dict. Reads GitHub-first; local fallback."""
    if config.persistent():
        try:
            text, _ = github.get_contents(PRICES_GIT)
            return json.loads(text)
        except Exception:
            pass
    try:
        with open(PRICES_LOCAL, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default_prices()


def default_prices():
    return {"updated": None, "items": [dict(it, result=None) for it in ITEMS]}


def serialize(prices):
    return json.dumps(prices, ensure_ascii=False, indent=2)