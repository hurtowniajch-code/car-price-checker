# Otomoto Catalog — Design

**Date:** 2026-09-16
**Repo:** `car-price-checker` (ileoto.pl), deployed at `/opt/car-price-checker` on 209.38.221.144
**Status:** approved design, ready for an implementation plan

## Problem

`public/js/brands-models.js` and `public/js/generations.js` are produced by `scripts/scrape-brands.ts`,
which drives a headless browser and **clicks** the Otomoto brand/model dropdowns. Brands that fail or
return nothing are skipped with a log line, and the output file is written anyway, so partial runs are
saved silently. Citroën was missing entirely and was added by hand (commit `dee23a3`). The scrape
covers only the car section (`/osobowe`).

Measured against Otomoto's own page data on 2026-09-15:

| | Current files | Otomoto today |
|---|---|---|
| Car brands | 160 | 190 (152 with listings) |
| Car models | 2 221 | 2 563 |
| Motorcycle brands / models | none | 263 / 3 066 |

Two consumers need this data:

1. **ileoto's own form** — brand, model and generation dropdowns.
2. **The samochody.be valuation panel** (`Wyceń`) — matches Informex names ("Série 3", "X1 & iX1",
   "500C") onto Otomoto names before the price search. A missing model means no ileoto price and a
   fallback AI estimate.

## Key finding

One request to a category page (`/osobowe`, `/motocykle-i-quady`) returns, inside `__NEXT_DATA__`,
`filters.states` containing:

- `filter_enum_make` with no condition → every brand: slug (`id`), display name, listing `counter`.
- `filter_enum_model` conditioned on a make → that brand's complete model list, same fields.
- `filter_enum_generation` conditioned on make+model → generations (cars only; motorcycles have none).

This replaces the whole dropdown-clicking crawl with **two HTTP requests**, and it yields Otomoto's
exact slugs, which removes slug guessing (`MODEL_SLUG_OVERRIDES` for Mercedes, and similar).

## Scope

In scope: brands, models and generations for cars **and** motorcycles; a verified full crawl; a
per-brand refresh button in the ileoto form; a catalog API used by the samochody backend.

Out of scope: per-model engine options (fuel types, capacities, powers) — the existing per-model
"Odśwież dane" button already refreshes those into `data/options-cache.json`; the price-search
changes for motorcycles (separate piece); the samochody backend changes (separate piece).

## Data

`data/catalog.json` on the ileoto server:

```jsonc
{
  "version": 1,
  "categories": {
    "osobowe": {
      "crawledAt": "2026-09-16T10:00:00.000Z",
      "brands": [
        {
          "slug": "volkswagen", "name": "Volkswagen", "count": 12345,
          "crawledAt": "2026-09-16T10:00:00.000Z",
          "models": [
            { "slug": "polo", "name": "Polo", "count": 1234,
              "generations": [{ "slug": "gen-v-2009-2017", "name": "V (2009-2017)" }] }
          ]
        }
      ]
    },
    "motocykle-i-quady": { "crawledAt": "...", "brands": [ /* same shape, generations always [] */ ] }
  }
}
```

Models with `count: 0` are kept (Otomoto lists them; they may gain listings later). The generic
"Inny" model is kept as Otomoto returns it; consumers may ignore it.

## Validation

Checks run before anything is written. If any fails, the existing catalog stays untouched.

1. **Minimum size** — cars: ≥150 brands and ≥1 500 models; motorcycles: ≥150 brands and ≥1 500 models.
2. **Model lists present** — every brand with `count > 0` has a non-empty model list.
3. **Totals** — per brand, `sum(model.count) == brand.count`, tolerating a gap of `max(5, 0.1%)` for
   listings with no model set (observed: 6 car brands off by 1–3).
4. **No sudden shrink** — compared with the current catalog, a brand may not lose more than 20% of its
   models, and a category may not lose more than 5% of its brands.

A brand failing check 2, 3 or 4 is re-read from its own brand page (`/osobowe/<brand>`) and re-checked.
If it still fails, the run stops with a report naming the brand and the failing check.

## Components (car-price-checker)

| File | Responsibility | Pure? |
|---|---|---|
| `src/catalog/types.ts` | `Catalog`, `CatalogCategory`, `CatalogBrand`, `CatalogModel`, `Generation` | — |
| `src/catalog/extract.ts` | page HTML → `CatalogCategory` (brands, models, generations, slugs, counts) | yes |
| `src/catalog/validate.ts` | the four checks; returns `{ ok, problems[] }`, never throws | yes |
| `src/catalog/merge.ts` | merge one refreshed brand into a catalog, returning the new catalog plus a diff (`added`, `removed`) | yes |
| `src/catalog/store.ts` | read/write `data/catalog.json`; write to `.tmp` then rename; keep previous as `.bak` | no |
| `src/catalog/fetch-page.ts` | fetch a category or brand page through the existing proxy, 3 retries | no |
| `scripts/crawl-catalog.ts` | full crawl: both categories → validate → per-brand retry → save; report; exit 1 on failure | no |
| `src/routes/catalog.ts` | `GET /api/catalog`, `POST /api/catalog/refresh`, `/js/brands-models.js`, `/js/generations.js` | no |

`extract.ts` reuses the `__NEXT_DATA__` parsing already proven in `scrape-brands.ts`
(`extractAllGenerations`) and `otomoto-fetch-scraper.ts`.

## API

- **`GET /api/catalog`** → the whole catalog (JSON). Used by the samochody backend, which caches it in
  memory for an hour and falls back to its bundled copy if ileoto is unreachable.
- **`GET /api/catalog?category=osobowe&brand=Volkswagen`** → one brand, for the UI.
- **`POST /api/catalog/refresh`** `{ category, brand }` → re-reads that brand's page, validates, merges,
  saves; responds `{ success, brand, models, added: [], removed: [], crawledAt }`.
  - `429` when the same brand was refreshed less than 10 minutes ago (the site is public and every
    refresh costs a proxy request).
  - `404` unknown brand; `503` Otomoto unreachable or no `__NEXT_DATA__`; `409` a failed check —
    all leave the catalog unchanged.
- **`/js/brands-models.js`, `/js/generations.js`** → generated from the catalog in exactly the shape
  `public/index.html` already loads (`BRANDS_MODELS`, `MODEL_TO_BRAND`, `ALL_BRANDS`, `ALL_MODELS`,
  `GENERATIONS`), so `app.js` needs no changes. If the catalog file is missing, the static files are
  served as they are today. Cars are the default; motorcycle brands are exposed as a separate global
  (`BRANDS_MODELS_MOTO`) for later use by the price search work.

## UI

One button next to the existing "Odśwież dane" in `public/index.html`, wired in `public/js/app.js`:

- **Label:** "Odśwież modele marki", with the brand's `crawledAt` date once known.
- **Click:** requires a brand; posts to `/api/catalog/refresh`; while running shows "Pobieram modele…".
- **Success:** updates `BRANDS_MODELS[brand]` in memory, rebuilds the model dropdown, and shows
  e.g. "Volkswagen: 65 modeli (+3 nowe)".
- **Failure:** shows the server message through the existing `showError`, and the old list stays.

## Testing

car-price-checker has no test framework; add **vitest** as a dev dependency and build this test-first.

- **Fixtures:** trimmed real `filters.states` JSON saved from a live page (one car brand with
  generations, one motorcycle brand, one brand with a count mismatch, one with an empty model list).
- **Unit tests:** `extract` (brands, models, generations, slugs, counts, a page without `__NEXT_DATA__`
  → error), `validate` (each of the four checks, pass and fail), `merge` (added/removed diff, brand not
  in catalog, other brands untouched).
- **Store tests:** atomic write, `.bak` kept, a corrupt `catalog.json` read as "no catalog".
- **Route tests:** refresh with a stubbed fetch — success, cooldown, unknown brand, failed check,
  Otomoto error; each asserting the stored catalog afterwards.
- **Live verification** (on the server, after deploy): run the crawl and confirm roughly 190/2 563 cars
  and 263/3 066 motorcycles; `GET /api/catalog`; open ileoto.pl, refresh one brand, check the dropdown;
  confirm `Volkswagen → Polo` and `Yamaha → FZ6` are present with their slugs.

## Deployment

1. Push to GitHub `main`.
2. `node scripts/deploy.js` → pull, `npm run build`, `pm2 restart car-price-checker` on 209.38.221.144.
3. Run `npx ts-node scripts/crawl-catalog.ts` once on the server (proxy env vars set) to create
   `data/catalog.json`.
4. Verify as under "Live verification".

**Rollback:** restore `data/catalog.json.bak`, or `git revert` and redeploy. The static
`brands-models.js` / `generations.js` files stay in the repo as the fallback path.

## Follow-ups (not in this work)

- **Rotate the proxy credentials**: they are hard-coded in `scripts/run-scrape-options.sh` and
  committed to GitHub. Move them to `.env` and rotate at the provider.
- **Use catalog slugs in `url-builder.ts`** instead of `slugify()` plus `MODEL_SLUG_OVERRIDES` —
  belongs with the motorcycle price-search piece.
- **Retire `scripts/scrape-brands.ts`** once the catalog is live.
