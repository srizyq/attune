#!/usr/bin/env python3
"""Roll'd Vietnamese: parse the chain's own "Nitty Gritty" nutrition PDF
(linked from https://rolld.com.au/pages/nutritional-dietary-allergen-information)
into the chain JSON format.

Cells are read by x/y position rather than text order: the PDF leaves blank
cells (e.g. trans fat) and text extraction silently drops them, which would
shift every later value into the wrong column. In this PDF's coordinates each
section's title/header block sits BELOW its rows.

Usage: python3 rolld.py <pdf path> <out json> <pdf url>
"""
import datetime, json, re, sys
import pypdf

PDF, OUT, URL = sys.argv[1], sys.argv[2], sys.argv[3]
TODAY = datetime.date.today().isoformat()
KJ_PER_KCAL = 4.184
COL0, COLW = 288.0, 201.5  # x of the first value column / spacing between value columns
HEADER_FIELDS = {'energy': 'kj', 'protein': 'protein_g', 'fat': 'fat_g', 'saturated': 'saturated_fat_g', 'trans': 'trans_fat_g',
                 'carbohydrates': 'carbs_g', 'sugars': 'sugar_g', 'dietary': 'fibre_g', 'sodium': 'sodium_mg'}
NUM = re.compile(r'-?\d+(\.\d+)?')
# Column order by how many nutrients a table has. Used instead of the printed
# labels: the Gỏi table's header says "Saturated Fat, Trans Fat" over what are
# plainly the Fat and Saturated Fat columns.
CANONICAL = {
    7: ['kj', 'protein_g', 'fat_g', 'saturated_fat_g', 'carbs_g', 'sugar_g', 'sodium_mg'],
    8: ['kj', 'protein_g', 'fat_g', 'saturated_fat_g', 'trans_fat_g', 'carbs_g', 'sugar_g', 'sodium_mg'],
    9: ['kj', 'protein_g', 'fat_g', 'saturated_fat_g', 'trans_fat_g', 'carbs_g', 'sugar_g', 'fibre_g', 'sodium_mg'],
}

# Section title (as printed) -> (category, text added to each name, size label)
SECTIONS = {
    'BANH MI': ('Banh Mi', ' Banh Mi', None),
    'BAO': ('Bao', ' Bao', None),
    'FRESH ROLLS': ('Rice Paper Rolls', ' Rice Paper Roll', None),
    'BOWLS': ('Phở & Noodle Soup', '', 'Bowl'),
    'CUPS': ('Phở & Noodle Soup', '', 'Cup'),
    'CONDIMENTS': ('Sauces & Condiments', '', None),
    'SIDES': ('Sides', '', None),
    'DRINKS': ('Drinks', '', None),
    'GỎI': ('Vietnamese Salad (Gỏi)', ' Gỏi (no dressing)', None),
    'CƠM': ('Vietnamese Rice (Cơm)', ' Cơm (no dressing)', None),
    'BÚN': ('Noodle Salad (Bún)', ' Bún (no dressing)', None),
}

def slug(s):
    s = s.lower().replace('ở', 'o').replace('ơ', 'o').replace('ỏ', 'o').replace('ơ', 'o').replace('ú', 'u').replace('é', 'e')
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')

def frags_of(page):
    out = []
    def visit(text, cm, tm, font, size):
        if text.strip(): out.append((tm[5], tm[4], text.strip()))
    page.extract_text(visitor_text=visit)
    return out

def parse_page(frags):
    rows = {}
    for y, x, t in frags: rows.setdefault(round(y), []).append((x, t))
    ys = sorted(rows, reverse=True)
    is_value = lambda y: sum(1 for x, t in rows[y] if x >= 250 and NUM.fullmatch(t)) >= 6
    is_header = lambda y: any('Energy' in t for _, t in rows[y]) and any('Protein' in t for _, t in rows[y])
    left_text = lambda y: [(x, t) for x, t in sorted(rows[y]) if x < 250 and not NUM.fullmatch(t)]

    items, pending = [], []
    for y in ys:
        if is_header(y):
            count = sum(1 for _, t in rows[y] if t.split()[0].lower() in HEADER_FIELDS)
            names = CANONICAL[count]
            title_parts, qty = [], None
            for y2 in ys:
                if y - 60 <= y2 <= y + 85 and not is_value(y2) and y2 != y:
                    for x, t in left_text(y2):
                        m = re.match(r'^\((\d+\s+[A-Za-z ]+?)\s*(?:/\s*[\w.]+)?\)$', t)
                        if m and y - 5 <= y2 <= y + 80: qty = m.group(1).strip()
                        elif t.isupper() and not NUM.search(t) and t not in ('PER', 'SERVE'): title_parts.append((y2, t.strip('() ')))
            title = ' '.join(t for _, t in sorted(title_parts, reverse=True))
            key = next((k for k in SECTIONS if k in title), None)
            for row_y in pending:
                items.append(dict(y=row_y, rows=rows, names=names, section=key, qty=qty, title=title))
            pending = []
        elif is_value(y):
            pending.append(y)
    out = []
    for it in items:
        y = it['y']; r = it['rows']
        vals = {round((x - COL0) / COLW): float(t) for x, t in r[y] if x >= 250 and NUM.fullmatch(t)}
        misaligned = any(abs((x - COL0) / COLW - round((x - COL0) / COLW)) > 0.15 for x, t in r[y] if x >= 250 and NUM.fullmatch(t))
        # name / per-item qty: same line, or the lines just above/below (Sides, Drinks, wrapped names)
        parts, item_qty = [], None
        near = [yy for yy in r if abs(yy - y) <= 14]
        for yy in sorted(near):
            if yy != y and (is_value(yy) or is_header(yy)): continue
            for x, t in left_text(yy):
                m = re.match(r'^\((\d+\s+[A-Za-z ]+?)\s*(?:/\s*(\d+)\s*(g|mL|ml))?\)$', t)
                if m: item_qty = m.group(1).strip(); continue
                if re.fullmatch(r'\(\d.*', t) or t in ('(1',): continue
                parts.append(t)
        out.append(dict(name=re.sub(r'\s+', ' ', ' '.join(parts)).strip(), vals=vals, misaligned=misaligned, item_qty=item_qty, **{k: it[k] for k in ('names', 'section', 'qty', 'title')}))
    return out

def check(fields, per100, header_grams):
    """Returns (grams, problems). The printed per-serve and per-100g columns must
    agree on a serve weight, and the calories must roughly match the macros."""
    problems = []
    est = sorted(fields[f] / per100[f] * 100 for f in fields if f in per100 and per100[f] >= 1 and fields[f] >= 5 and f not in ('sodium_mg',))
    grams = est[len(est) // 2] if est else None
    if grams and header_grams and abs(grams - header_grams) / header_grams > 0.12 and len(est) < 3: grams = header_grams
    if grams is None: grams = header_grams
    if grams:
        bad = [f for f in fields if f in per100 and per100[f] >= 1 and fields[f] >= 5 and abs(fields[f] / per100[f] * 100 - grams) / grams > 0.08]
        if len(bad) >= 2: problems.append(f"per-serve and per-100g columns disagree on {', '.join(bad)}")
    kcal = fields['kj'] / KJ_PER_KCAL
    if all(k in fields for k in ('protein_g', 'carbs_g', 'fat_g')):
        implied = 4 * fields['protein_g'] + 4 * fields['carbs_g'] + 9 * fields['fat_g']
        if abs(implied - kcal) > max(45, 0.3 * kcal): problems.append(f"calories {kcal:.0f} don't match macros ({implied:.0f})")
    else:
        problems.append('missing protein/carbs/fat')
    return (round(grams) if grams else None), problems

def to_rows(parsed):
    rows, seen, vectors = [], set(), {}
    for p in parsed:
        if not p['section'] or not p['name']: continue
        category, suffix, size = SECTIONS[p['section']]
        fields, per100 = {}, {}
        for k, f in enumerate(p['names']):
            if 2 * k in p['vals']: fields[f] = p['vals'][2 * k]
            if 2 * k + 1 in p['vals']: per100[f] = p['vals'][2 * k + 1]
        if not fields.get('kj'): continue
        qty = p['item_qty'] or p['qty'] or '1 serve'
        header_g = None
        m = re.search(r'/\s*(\d+)\s*g', p.get('title', '') or '')
        grams, problems = check(fields, per100, header_g)
        if p['misaligned']: problems.append('cells are not on the table grid (a row with deleted cells)')
        unit_ml = p['section'] == 'DRINKS'
        name = p['name'] + suffix
        ident = (name.lower(), (size or '').lower())
        if ident in seen: continue
        seen.add(ident)
        vec = tuple(sorted(p['vals'].items()))
        if vec in vectors and vectors[vec] != p['section']:
            problems.append(f"every number is identical to a row in another table ({vectors[vec]}) — likely a copy/paste slip in the source")
        vectors.setdefault(vec, p['section'])
        row = {
            'id': f"rolld-au_{slug(name)}" + (f"_{slug(size)}" if size else ''),
            'name': name, 'category': category, 'size_label': size,
            'serving_label': (qty if re.match(r'^\d', qty) else f"1 {qty}") + (f" ({grams}{'mL' if unit_ml else 'g'})" if grams else ''),
            'serving_grams': grams,
            'calories': round(fields['kj'] / KJ_PER_KCAL),
            'protein_g': fields.get('protein_g'), 'carbs_g': fields.get('carbs_g'), 'fat_g': fields.get('fat_g'),
            'fibre_g': fields.get('fibre_g'), 'sodium_mg': fields.get('sodium_mg'), 'sugar_g': fields.get('sugar_g'),
            'saturated_fat_g': fields.get('saturated_fat_g'), 'trans_fat_g': fields.get('trans_fat_g'),
            'source_url': URL, 'verified_date': TODAY,
        }
        if problems:
            row['_unverified'] = True
            row['_unverified_reason'] = '; '.join(problems)
        rows.append(row)
    return rows

reader = pypdf.PdfReader(PDF)
parsed = []
for page in reader.pages: parsed += parse_page(frags_of(page))
rows = to_rows(parsed)
CHAIN = {'id': 'rolld-au', 'name': "Roll'd Vietnamese", 'country': 'AU', 'category': 'vietnamese', 'website_url': 'https://rolld.com.au'}
json.dump({'chain': CHAIN, 'items': rows}, open(OUT, 'w'), indent=2, ensure_ascii=False)
print(len(rows), 'rows;', sum(1 for r in rows if r.get('_unverified')), 'flagged unverified')
for r in rows:
    if r.get('_unverified'): print('  FLAGGED', r['category'], '|', r['name'], '|', r['_unverified_reason'])
