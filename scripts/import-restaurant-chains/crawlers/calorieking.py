#!/usr/bin/env python3
"""Crawl one restaurant brand from CalorieKing Australia into the chain JSON
format used by commit-to-db.mjs.

CalorieKing lists a chain's menu by section ("classification") and publishes
per-100g nutrition plus one or more serving sizes for each item. Each item
becomes one row per serving size (so Small / Regular / Large are separate,
like Starbucks' rows), carrying the CalorieKing item URL as its source.

Rows whose calories don't roughly match their macros are written with
`_unverified: true` (+ `_unverified_reason`), which commit-to-db.mjs skips.

Usage: calorieking.py <brand uuid> <chain id> "<chain name>" <category> <website> <out json> [--merge existing.json]
"""
import base64, concurrent.futures as cf, datetime, hashlib, json, os, re, sys, time, urllib.parse, urllib.request, uuid

UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36'}
CACHE = os.environ.get('CK_CACHE', '/tmp/ckcache')
TODAY = datetime.date.today().isoformat()
KJ_PER_KCAL = 4.184
os.makedirs(CACHE, exist_ok=True)

def short(u): return base64.urlsafe_b64encode(uuid.UUID(u).bytes).decode().rstrip('=')

def get(url, tries=4):
    key = os.path.join(CACHE, hashlib.md5(url.encode()).hexdigest())
    if os.path.exists(key): return open(key, encoding='utf-8').read()
    last = None
    for i in range(tries):
        try:
            html = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read().decode('utf-8', 'replace')
            open(key, 'w', encoding='utf-8').write(html)
            return html
        except Exception as e:
            last = e; time.sleep(1.5 * (i + 1))
    raise last

def page_props(url):
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', get(url), re.S)
    return json.loads(m.group(1))['props']['pageProps']

def slug(s):
    s = s.lower().replace("'", '').replace('’', '').replace('&', ' and ')
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')

SIZE_WORDS = ['extra small', 'extra large', 'xx large', 'x large', 'xl', 'mini', 'small', 'regular', 'medium', 'large', 'junior', 'snack', 'share', 'family', 'kids', 'single', 'double', 'triple']

def size_of(serving_name):
    n = serving_name.lower()
    for w in SIZE_WORDS:
        if n.startswith(w + ' ') or n == w: return w.title()
    return None

def nice_category(c):
    c = (c or 'Menu').replace(' / ', ' & ')
    if ',' in c:
        a, b = [x.strip() for x in c.split(',', 1)]
        c = f'{b} {a}'
    return c

def list_foods(bid):
    base = f'https://www.calorieking.com/au/en/foods/b/calories-in-brand/{short(bid)}'
    top = page_props(base)
    classes = list(top['statuses'].keys()) if top.get('statuses') else []
    foods = {}
    for c in classes:
        pp = page_props(base + '?classification=' + urllib.parse.quote(c))
        for g in pp['groups']:
            for f in g['foods']:
                foods[f['foodId']] = (f['name'], c)
        if pp.get('hasMore') or any(s.get('hasMore') for s in (pp.get('statuses') or {}).values()):
            print(f'  WARNING: {c} has more than one page of results — only the first page was read', file=sys.stderr)
    return top['brand']['name'], foods

def fetch_food(fid):
    return page_props(f'https://www.calorieking.com/au/en/foods/f/calories-in-food/{short(fid)}')

def rows_for(fid, name, classification, chain_id):
    pp = fetch_food(fid)
    raw = pp['foodRaw']
    n = raw['nutrients']
    # Three bases: per `mass` grams, per `volume` mL, or (mass and volume both null) per serving.
    mass, volume = raw.get('mass'), raw.get('volume')
    servings = [s for s in raw.get('servings', []) if s.get('scale', 0) > 0 and not re.fullmatch(r'(100\s*)?(g|gram|grams|ml)', s['name'].strip().lower())]
    if not servings and raw.get('defaultServing'): servings = [raw['defaultServing']]
    if not servings: return []
    url = f'https://www.calorieking.com/au/en/foods/f/calories-in-food/{short(fid)}'
    out = []
    multi = len(servings) > 1
    for s in servings:
        k = s['scale']
        if mass: unit, grams = 'g', round(mass * k)
        elif volume: unit, grams = 'mL', round(volume * k)
        else: unit, grams = None, None  # per-serving data: the weight isn't published, so it isn't invented
        g = lambda key, nd=1: (round(n[key] * k, nd) if n.get(key) is not None else None)
        kcal = round(n['energy'] * k / KJ_PER_KCAL) if n.get('energy') is not None else None
        if kcal is None: continue
        size = size_of(s['name']) if multi else None
        if multi and size is None: size = s['name'].strip().title()
        label = f"1 {s['name'].strip()}" if not re.match(r'^\d', s['name'].strip()) else s['name'].strip()
        row = {
            'id': f"{chain_id}_{slug(name)}" + (f"_{slug(size)}" if size else ''),
            'name': name.strip(), 'category': nice_category(classification), 'size_label': size,
            'serving_label': f"{label} ({grams}{unit})" if grams else label, 'serving_grams': grams, 'calories': kcal,
            'protein_g': g('protein'), 'carbs_g': g('netCarbs'), 'fat_g': g('fat'),
            'fibre_g': g('fiber'), 'sodium_mg': round(n['sodium'] * k) if n.get('sodium') is not None else None,
            'sugar_g': g('sugar'), 'saturated_fat_g': g('satFat'), 'trans_fat_g': None,
            'source_url': url, 'verified_date': TODAY,
        }
        problems = []
        if all(row[x] is not None for x in ('protein_g', 'carbs_g', 'fat_g')):
            alc = (n.get('alcohol') or 0) * k * 7
            implied = 4 * row['protein_g'] + 4 * row['carbs_g'] + 9 * row['fat_g'] + alc + 2 * (row['fibre_g'] or 0)
            if abs(implied - kcal) > max(45, 0.3 * kcal): problems.append(f"calories {kcal} don't match macros ({implied:.0f})")
        else:
            problems.append('missing protein/carbs/fat')
        if kcal > 6000: problems.append('implausibly high calories')
        if grams:
            if kcal / grams > 9.3: problems.append(f'{kcal / grams:.1f} kcal/g is more than pure fat')
            if grams > 2500 and unit == 'g': problems.append(f'serving weight {grams}g implausible')
            macros = (row['protein_g'] or 0) + (row['carbs_g'] or 0) + (row['fat_g'] or 0)
            if macros > grams * 1.08: problems.append(f'macros ({macros:.0f}g) exceed the serving weight ({grams}g)')
            if row['sodium_mg'] and row['sodium_mg'] > 380 * grams: problems.append('sodium exceeds the weight of the serving')
        if re.search(r'\b(dry|raw|uncooked)\b', name, re.I): problems.append('an ingredient, not a menu item')
        if problems:
            row['_unverified'] = True; row['_unverified_reason'] = '; '.join(problems)
        out.append(row)
    return out

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    bid, chain_id, chain_name, category, website, out_path = args[:6]
    merge = None
    if '--merge' in sys.argv: merge = sys.argv[sys.argv.index('--merge') + 1]
    brand_name, foods = list_foods(bid)
    print(f'{brand_name}: {len(foods)} foods in {len({c for _, c in foods.values()})} sections', file=sys.stderr)
    rows = []
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        futs = {ex.submit(rows_for, fid, nm, cl, chain_id): fid for fid, (nm, cl) in foods.items()}
        for f in cf.as_completed(futs):
            try: rows += f.result()
            except Exception as e: print('  FAILED', foods[futs[f]], e, file=sys.stderr)
    # unique (name, size): disambiguate collisions by section
    seen = {}
    rows.sort(key=lambda r: (r['category'], r['name'].lower(), r['size_label'] or ''))
    final = []
    for r in rows:
        key = (r['name'].lower(), (r['size_label'] or '').lower())
        if key in seen:
            if seen[key]['serving_grams'] == r['serving_grams'] and seen[key]['calories'] == r['calories']: continue  # true duplicate
            r['name'] = f"{r['name']} ({r['category']})"
            r['id'] = f"{chain_id}_{slug(r['name'])}" + (f"_{slug(r['size_label'])}" if r['size_label'] else '')
            key = (r['name'].lower(), (r['size_label'] or '').lower())
            if key in seen: continue
        seen[key] = r
        final.append(r)
    if merge and os.path.exists(merge):
        existing = json.load(open(merge))
        have = {(i['name'].lower(), (i.get('size_label') or '').lower()) for i in existing['items']}
        have_names = {i['name'].lower() for i in existing['items']}
        added = [r for r in final if (r['name'].lower(), (r['size_label'] or '').lower()) not in have and r['name'].lower() not in have_names]
        existing['items'] += added
        json.dump(existing, open(out_path, 'w'), indent=2, ensure_ascii=False)
        print(f'{chain_id}: merged +{len(added)} (had {len(existing["items"]) - len(added)}), flagged {sum(1 for r in added if r.get("_unverified"))}', file=sys.stderr)
        return
    chain = {'id': chain_id, 'name': chain_name, 'country': 'AU', 'category': category, 'website_url': website}
    json.dump({'chain': chain, 'items': final}, open(out_path, 'w'), indent=2, ensure_ascii=False)
    print(f'{chain_id}: {len(final)} rows, {sum(1 for r in final if r.get("_unverified"))} flagged unverified', file=sys.stderr)

main()
