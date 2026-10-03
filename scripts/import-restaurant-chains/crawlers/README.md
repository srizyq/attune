# Restaurant data collectors

Scripts used to build `../chains/*.json`. They write chain files in the format
`../commit-to-db.mjs` imports. Nothing here touches the database.

| Script | Source | Notes |
| --- | --- | --- |
| `rolld.py` | Roll'd's own "Nitty Gritty" nutrition PDF (linked from rolld.com.au/pages/nutritional-dietary-allergen-information) | Cells read by position (the PDF has blank cells); printed header typos handled; rows whose numbers disagree with each other are flagged. |
| `calorieking.py` | CalorieKing Australia brand pages | One row per serving size. Handles per-100g, per-100mL and per-serving data. Reads at most the first 100 items of any one menu section. |
| `finalize.py` | — | Folds a crawl into `../chains/`. New chains are copied; existing chains only gain items not already there (same id, same normalised name, or a near-identical name). |
| `audit.py` | — | Marks rows `_unverified` that would break the import (same chain+name+size) or whose numbers can't be right. |

Every row cites the page it came from (`source_url`) and the date (`verified_date`).
Rows marked `_unverified` stay in the files with a `_unverified_reason`, are skipped
by the import, and can be removed from a database that already has them with
`node scripts/import-restaurant-chains/commit-to-db.mjs --prune-unverified`.

## Things to know

- **Terms of use.** CalorieKing sells its data under licence (calorieking.com/au/en/developers/data-license).
  Reading its public pages is how the earlier chain files were built too, but before this
  data is relied on commercially, check that the use is permitted or take the licence.
- **Not a menu.** CalorieKing also lists retail and raw products; names containing dry/raw/uncooked
  are flagged as "an ingredient, not a menu item".
- **No weights.** Items CalorieKing publishes per serving have no serving weight. `serving_grams` is
  left null rather than invented; the app then treats the serving as its only unit.
- **Run order.** `calorieking.py` (or `rolld.py`) → `finalize.py <dir>` → `audit.py` → `npx vitest run scripts/import-restaurant-chains`.
