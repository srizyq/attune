#!/usr/bin/env python3
"""Flag chain-file rows the importer must not load, in place.

A row is marked `_unverified` (commit-to-db.mjs skips those) when:
  - it shares (chain, name, size) with another row — the database has a unique
    index on that, so the whole import would fail. The row from the chain's
    own site wins; otherwise the first one stays;
  - its calories disagree badly with its own macros; or
  - its calories / macros are impossible for its serving weight.
Thresholds match chains.test.js. Already-flagged rows are left alone.
"""
import glob, json, os, sys

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'chains')
PREFIX = 'Flagged in the October 2026 audit: '

def problems(i):
    out = []
    if all(i.get(k) is not None for k in ('protein_g', 'carbs_g', 'fat_g')):
        implied = 4 * i['protein_g'] + 4 * i['carbs_g'] + 9 * i['fat_g'] + 2 * (i.get('fibre_g') or 0)
        if abs(implied - i['calories']) > max(60, 0.4 * i['calories']): out.append(f"{i['calories']} kcal but its macros add up to about {implied:.0f}")
    g = i.get('serving_grams')
    if g:
        if i['calories'] / g > 9.5: out.append(f"{i['calories']} kcal in {g}g is more than pure fat")
        macros = (i.get('protein_g') or 0) + (i.get('carbs_g') or 0) + (i.get('fat_g') or 0)
        if macros > g * 1.1 + 2: out.append(f"macros ({macros:.0f}g) exceed the {g}g serving")
        if g > 6000: out.append(f'serving weight {g}g')
    if i['calories'] > 5000: out.append(f"{i['calories']} kcal")
    return out

def flag(i, why):
    i['_unverified'] = True
    i['_unverified_reason'] = PREFIX + why

changed = 0
for path in sorted(glob.glob(os.path.join(DIR, '*.json'))):
    d = json.load(open(path)); touched = False
    groups = {}
    for i in d['items']:
        if i.get('_unverified'): continue
        groups.setdefault((i['name'].lower(), (i.get('size_label') or '').lower()), []).append(i)
    for key, rows in groups.items():
        if len(rows) < 2: continue
        rows.sort(key=lambda r: 0 if 'calorieking' not in r['source_url'] and 'fatsecret' not in r['source_url'] else 1)
        for r in rows[1:]:
            flag(r, f"same name and size as '{rows[0]['id']}' but different numbers ({rows[0]['calories']} vs {r['calories']} kcal), and the database allows one row per name and size"); touched = True; changed += 1
    for i in d['items']:
        if i.get('_unverified'): continue
        p = problems(i)
        if p: flag(i, '; '.join(p)); touched = True; changed += 1
    if touched: json.dump(d, open(path, 'w'), indent=2, ensure_ascii=False)
print('flagged', changed, 'rows')
