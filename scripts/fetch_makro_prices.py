#!/usr/bin/env python3
"""Fetch current Makro PRO prices for the tracked items into data/prices.json.

Run from the repo root:
    python scripts/fetch_makro_prices.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api import prices


def main():
    data = prices.fetch_prices()
    with open(prices.PRICES_LOCAL, "w", encoding="utf-8") as f:
        f.write(prices.serialize(data))
    ok = sum(1 for it in data["items"] if it.get("result"))
    print(f"Updated {ok}/{len(data['items'])} items -> {prices.PRICES_LOCAL}")
    for it in data["items"]:
        r = it.get("result")
        price = r["price"] if r else None
        print(f"  {it['name']:<14} ฿{price if price is not None else '—'}")


if __name__ == "__main__":
    main()