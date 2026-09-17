#!/usr/bin/env python3
# Parses the official AUSNUT 2023 "Food nutrient profiles" spreadsheet
# (FSANZ, CC BY 4.0 — https://foodstandards.gov.au/science-data/
# food-nutrient-databases/ausnut) into ausnut-foods.json, ready for
# 02-commit-to-db.mjs to upsert into public.ausnut_foods.
#
# Pure data transform — no network calls, no API cost, nothing to review
# for quality (this is real government-measured data, not a generated
# estimate) beyond making sure the column mapping below is right.

import json
import os
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "AUSNUT 2023 - Food nutrient profiles.xlsx")
OUT = os.path.join(HERE, "ausnut-foods.json")

KJ_PER_KCAL = 4.184

# Column mapping: ausnut_foods column -> source header text (must match
# exactly, checked against the header row below).
COLUMN_MAP = {
    "id": "Public food key",
    "name": "Food name",
    "derivation": "Derivation",
    "calories_kj": "Energy with dietary fibre (kJ)",  # converted to kcal below
    "protein_g": "Protein (g)",
    "carbs_g": "Available carbohydrate, without sugar alcohols (g)",
    "fat_g": "Total fat (g)",
    "fibre_g": "Dietary fibre (g)",
    "sodium_mg": "Sodium (Na) (mg)",
    "sugar_g": "Total sugars (g)",
    "vitamin_a_mcg": "Vitamin A retinol equivalents (ug)",
    "vitamin_c_mg": "Vitamin C (mg)",
    "polyunsaturated_fat_g": "Total polyunsaturated fat (g)",
    "monounsaturated_fat_g": "Total monounsaturated fat (g)",
    "magnesium_mg": "Magnesium (Mg) (mg)",
    "zinc_mg": "Zinc (Zn) (mg)",
    "vitamin_b12_mcg": "Cobalamin (B12) (ug)",
    "folate_mcg": "Dietary folate equivalents (ug)",
}


def num(v):
    if v is None:
        return 0
    return round(float(v), 2)


def main():
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    ws = wb["Food nutrient profiles"]
    rows = list(ws.iter_rows(values_only=True))

    header = rows[2]
    header_index = {name: i for i, name in enumerate(header) if name is not None}

    missing = [src for src in COLUMN_MAP.values() if src not in header_index]
    if missing:
        raise SystemExit(f"Header columns not found, mapping is stale: {missing}")

    idx = {key: header_index[src] for key, src in COLUMN_MAP.items()}

    foods = []
    seen_ids = set()
    for row in rows[3:]:
        if row[idx["id"]] is None:
            continue
        food_id = str(row[idx["id"]])
        if food_id in seen_ids:
            raise SystemExit(f"Duplicate id found in source data: {food_id}")
        seen_ids.add(food_id)

        foods.append({
            "id": food_id,
            "name": row[idx["name"]],
            "derivation": row[idx["derivation"]],
            "calories": num((row[idx["calories_kj"]] or 0) / KJ_PER_KCAL),
            "protein_g": num(row[idx["protein_g"]]),
            "carbs_g": num(row[idx["carbs_g"]]),
            "fat_g": num(row[idx["fat_g"]]),
            "fibre_g": num(row[idx["fibre_g"]]),
            "sodium_mg": num(row[idx["sodium_mg"]]),
            "sugar_g": num(row[idx["sugar_g"]]),
            "vitamin_a_mcg": num(row[idx["vitamin_a_mcg"]]),
            "vitamin_c_mg": num(row[idx["vitamin_c_mg"]]),
            "polyunsaturated_fat_g": num(row[idx["polyunsaturated_fat_g"]]),
            "monounsaturated_fat_g": num(row[idx["monounsaturated_fat_g"]]),
            "magnesium_mg": num(row[idx["magnesium_mg"]]),
            "zinc_mg": num(row[idx["zinc_mg"]]),
            "vitamin_b12_mcg": num(row[idx["vitamin_b12_mcg"]]),
            "folate_mcg": num(row[idx["folate_mcg"]]),
        })

    with open(OUT, "w") as f:
        json.dump(foods, f, indent=2)

    print(f"Parsed {len(foods)} foods -> {OUT}")


if __name__ == "__main__":
    main()
