#!/usr/bin/env python3
"""Fold freshly crawled chain files into chains/ safely.

  finalize.py <crawl dir>

- New chains are copied in as they are (flagged rows are kept, marked
  `_unverified`, and skipped by commit-to-db.mjs).
- For chains that already exist, only items the existing file doesn't already
  have are appended: matched on id, and on a normalised name (so "Big Mac
  Burger" doesn't duplicate the existing "Big Mac").
- A chain with fewer than 5 usable items is not added.
"""
import difflib, json, os, re, sys, glob

SRC = sys.argv[1]
DEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'chains')
MIN_ITEMS = 5

def norm(name, strip_burger=False):
    n = name.lower()
    n = re.sub(r'\(.*?\)', '', n)
    if strip_burger: n = re.sub(r'\bburger\b$', '', n.strip())
    return re.sub(r'[^a-z0-9]', '', n)

def usable(items): return [i for i in items if not i.get('_unverified')]

summary = []
for path in sorted(glob.glob(os.path.join(SRC, '*.json'))):
    fname = os.path.basename(path)
    data = json.load(open(path))
    dest = os.path.join(DEST, fname)
    if os.path.exists(dest):
        existing = json.load(open(dest))
        have_ids = {i['id'] for i in existing['items']}
        have_names = {(norm(i['name'], True), (i.get('size_label') or '').lower()) for i in existing['items']}
        have_plain = {norm(i['name'], True) for i in existing['items']}
        base = len(existing['items'])
        added = 0
        existing_norms = sorted(have_plain)
        near = 0
        for i in data['items']:
            if i['id'] in have_ids: continue
            key = (norm(i['name'], True), (i.get('size_label') or '').lower())
            if key in have_names or norm(i['name'], True) in have_plain: continue
            # A near-identical name (reworded, or a missing/extra word) is the same product already in the file.
            n = norm(i['name'], True)
            if n and difflib.get_close_matches(n, existing_norms, n=1, cutoff=0.9):
                near += 1; continue
            i = dict(i)
            if i['name'].endswith(' Burger'): i['name'] = i['name'][:-len(' Burger')]
            existing['items'].append(i); have_ids.add(i['id']); have_names.add(key); added += 1
        # a stripped " Burger" name could now collide with an id already used
        seen, uniq = set(), []
        for i in existing['items']:
            if i['id'] in seen: continue
            seen.add(i['id']); uniq.append(i)
        existing['items'] = uniq
        json.dump(existing, open(dest, 'w'), indent=2, ensure_ascii=False)
        summary.append((fname, f'merged +{added} (was {base}; {near} near-duplicates skipped)'))
    else:
        if len(usable(data['items'])) < MIN_ITEMS:
            summary.append((fname, 'SKIPPED — fewer than 5 usable items')); continue
        json.dump(data, open(dest, 'w'), indent=2, ensure_ascii=False)
        summary.append((fname, f"new: {len(usable(data['items']))} usable, {len(data['items']) - len(usable(data['items']))} flagged"))
for f, s in summary: print(f'{f:28s} {s}')
