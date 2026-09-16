# Otomoto Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the partial dropdown-clicking crawl with a verified catalog of Otomoto brands, models and generations for cars **and** motorcycles, served by an API and refreshable per brand from the ileoto form.

**Architecture:** One request per Otomoto category page carries every brand, model and generation inside `__NEXT_DATA__` → `filters.states`. Pure modules do extraction, validation and merging; thin modules do fetching and file storage; a script runs the full crawl; an Express router serves the catalog and regenerates the two `/js/*.js` files the existing form already loads.

**Tech Stack:** TypeScript (CommonJS), Express 4, undici (proxy fetch), vitest (new), Node 20 on the server.

**Spec:** `docs/superpowers/specs/2026-09-16-otomoto-catalog-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/catalog/types.ts` | Catalog type definitions shared by every other module |
| `src/catalog/extract.ts` | **Pure.** Page HTML → `CatalogCategory` |
| `src/catalog/validate.ts` | **Pure.** The four checks → list of problems |
| `src/catalog/merge.ts` | **Pure.** Merge one brand into a catalog + diff |
| `src/catalog/store.ts` | Read/write `data/catalog.json` atomically, keep `.bak` |
| `src/catalog/fetch-page.ts` | Fetch an Otomoto page through the proxy, with retries |
| `src/catalog/crawl.ts` | Compose: fetch both categories → validate → per-brand retry |
| `src/catalog/js-files.ts` | **Pure.** Catalog → `brands-models.js` / `generations.js` text |
| `src/routes/catalog.ts` | `GET /api/catalog`, `POST /api/catalog/refresh`, `/js/*.js` |
| `scripts/crawl-catalog.ts` | CLI wrapper around `crawl.ts` that saves and reports |
| `src/server.ts` | Mount the catalog router **before** `express.static` |
| `public/index.html`, `public/js/app.js` | "Odśwież modele marki" button |
| `src/catalog/__fixtures__/states.ts` | Real-shape fixture used by the unit tests |
| `vitest.config.ts`, `package.json` | Test setup |

---

## Task 1: Test setup and catalog types

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/catalog/types.ts`
- Create: `src/catalog/types.test.ts`

- [ ] **Step 1: Install vitest**

Run: `npm install --save-dev vitest@^3.2.4`
Expected: it is added to `devDependencies`.

- [ ] **Step 2: Add test scripts**

In `package.json`, inside `"scripts"`, after the `"scrape-brands"` line, add:

```json
    "test": "vitest run",
    "test:watch": "vitest",
    "crawl-catalog": "ts-node scripts/crawl-catalog.ts"
```

(Add a comma to the previous line so the JSON stays valid.)

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Write the failing test**

Create `src/catalog/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CATEGORY_IDS, isCategoryId } from './types';

describe('category ids', () => {
  it('lists the two Otomoto categories we crawl', () => {
    expect(CATEGORY_IDS).toEqual(['osobowe', 'motocykle-i-quady']);
  });
  it('recognises a valid category id', () => {
    expect(isCategoryId('osobowe')).toBe(true);
    expect(isCategoryId('ciezarowe')).toBe(false);
  });
});
```

- [ ] **Step 5: Run it and watch it fail**

Run: `npx vitest run src/catalog/types.test.ts`
Expected: FAIL — cannot find module `./types`.

- [ ] **Step 6: Create `src/catalog/types.ts`**

```ts
/** Otomoto sections we build a catalog for. */
export const CATEGORY_IDS = ['osobowe', 'motocykle-i-quady'] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export function isCategoryId(value: string): value is CategoryId {
  return (CATEGORY_IDS as readonly string[]).includes(value);
}

export interface Generation {
  /** Otomoto filter_enum_generation value, e.g. "gen-v-2009-2017" */
  slug: string;
  name: string;
}

export interface CatalogModel {
  /** Otomoto model slug, e.g. "polo" */
  slug: string;
  name: string;
  /** listings Otomoto reports for this model */
  count: number;
  generations: Generation[];
}

export interface CatalogBrand {
  /** Otomoto make slug, e.g. "volkswagen" */
  slug: string;
  name: string;
  count: number;
  /** ISO timestamp of the page this brand came from */
  crawledAt: string;
  models: CatalogModel[];
}

export interface CatalogCategory {
  crawledAt: string;
  brands: CatalogBrand[];
}

export interface Catalog {
  version: 1;
  categories: Record<CategoryId, CatalogCategory>;
}

export function emptyCatalog(): Catalog {
  return {
    version: 1,
    categories: {
      osobowe: { crawledAt: '', brands: [] },
      'motocykle-i-quady': { crawledAt: '', brands: [] },
    },
  };
}
```

- [ ] **Step 7: Run the test and watch it pass**

Run: `npx vitest run src/catalog/types.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/catalog/types.ts src/catalog/types.test.ts
git commit -m "chore(catalog): add vitest and catalog types"
```

---

## Task 2: Extract a category from page HTML

Otomoto's page carries `<script id="__NEXT_DATA__">` whose `props.pageProps.urqlState` holds entries
with a JSON string `data`. One of those parses to an object with `filters.states`, an array where:

- `filterId: "filter_enum_make"` with **no** `conditions` → every brand in `values[0].values`
- `filterId: "filter_enum_model"` with `conditions: [{filterId: "filter_enum_make", value: "<brand slug>"}]`
- `filterId: "filter_enum_generation"` with make **and** model conditions

Each value is `{ id, name, counter }`.

**Files:**
- Create: `src/catalog/__fixtures__/states.ts`
- Create: `src/catalog/extract.ts`
- Create: `src/catalog/extract.test.ts`

- [ ] **Step 1: Create the fixture**

Create `src/catalog/__fixtures__/states.ts`:

```ts
/** Real-shape trimmed copy of Otomoto's filters.states (captured 2026-09-15). */
const value = (id: string, name: string, counter: number) => ({
  __typename: 'AdvertSearchFilterValue', id, name, description: null, counter,
});

const state = (filterId: string, conditions: { filterId: string; value: string }[], values: any[]) => ({
  filterId,
  conditions: conditions.map((c) => ({ __typename: 'AdvertSearchFilterStateCondition', ...c, type: 'IS' })),
  values: [{ values }],
});

export const CAR_STATES = [
  state('filter_enum_make', [], [
    value('volkswagen', 'Volkswagen', 300),
    value('fiat', 'Fiat', 50),
    value('doosan', 'Doosan', 0),
  ]),
  state('filter_enum_model', [{ filterId: 'filter_enum_make', value: 'volkswagen' }], [
    value('polo', 'Polo', 120),
    value('golf', 'Golf', 180),
    value('buggy', 'Buggy', 0),
  ]),
  state('filter_enum_model', [{ filterId: 'filter_enum_make', value: 'fiat' }], [
    value('500', '500', 30),
    value('500l', '500L', 20),
  ]),
  state('filter_enum_generation', [
    { filterId: 'filter_enum_make', value: 'volkswagen' },
    { filterId: 'filter_enum_model', value: 'polo' },
  ], [
    value('gen-v-2009-2017', 'V (2009-2017)', 0),
    value('gen-vi-2017', 'VI (2017-)', 0),
  ]),
];

export const MOTO_STATES = [
  state('filter_enum_make', [], [value('yamaha', 'Yamaha', 90)]),
  state('filter_enum_model', [{ filterId: 'filter_enum_make', value: 'yamaha' }], [
    value('fz6', 'FZ6', 60),
    value('mt-07', 'MT-07', 30),
  ]),
];

/** Wrap states the way a real Otomoto page does. */
export function pageHtml(states: unknown[]): string {
  const nextData = {
    props: { pageProps: { urqlState: {
      abc: { data: JSON.stringify({ __typename: 'Query', filters: { states } }) },
      def: { data: JSON.stringify({ advertSearch: { edges: [] } }) },
    } } },
  };
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></body></html>`;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/catalog/extract.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractCategory } from './extract';
import { CAR_STATES, MOTO_STATES, pageHtml } from './__fixtures__/states';

const AT = '2026-09-16T10:00:00.000Z';

describe('extractCategory', () => {
  const cars = extractCategory(pageHtml(CAR_STATES), AT);

  it('returns every brand with slug, name and listing count', () => {
    expect(cars.brands.map((b) => b.slug)).toEqual(['volkswagen', 'fiat', 'doosan']);
    expect(cars.brands[0]).toMatchObject({ slug: 'volkswagen', name: 'Volkswagen', count: 300, crawledAt: AT });
    expect(cars.crawledAt).toBe(AT);
  });

  it('attaches each brand its models, including zero-listing ones', () => {
    const vw = cars.brands.find((b) => b.slug === 'volkswagen')!;
    expect(vw.models.map((m) => m.slug)).toEqual(['polo', 'golf', 'buggy']);
    expect(vw.models[0]).toMatchObject({ slug: 'polo', name: 'Polo', count: 120 });
  });

  it('attaches generations to the right model', () => {
    const polo = cars.brands.find((b) => b.slug === 'volkswagen')!.models.find((m) => m.slug === 'polo')!;
    expect(polo.generations).toEqual([
      { slug: 'gen-v-2009-2017', name: 'V (2009-2017)' },
      { slug: 'gen-vi-2017', name: 'VI (2017-)' },
    ]);
    const golf = cars.brands.find((b) => b.slug === 'volkswagen')!.models.find((m) => m.slug === 'golf')!;
    expect(golf.generations).toEqual([]);
  });

  it('gives a brand with no model state an empty model list', () => {
    expect(cars.brands.find((b) => b.slug === 'doosan')!.models).toEqual([]);
  });

  it('handles a category without generations (motorcycles)', () => {
    const moto = extractCategory(pageHtml(MOTO_STATES), AT);
    expect(moto.brands).toHaveLength(1);
    expect(moto.brands[0].models.map((m) => m.slug)).toEqual(['fz6', 'mt-07']);
    expect(moto.brands[0].models[0].generations).toEqual([]);
  });

  it('throws a clear error when the page has no __NEXT_DATA__ (Cloudflare page)', () => {
    expect(() => extractCategory('<html>Just a moment...</html>', AT)).toThrow(/__NEXT_DATA__/);
  });

  it('throws when the page has no filter states', () => {
    expect(() => extractCategory(pageHtml([]), AT)).toThrow(/filter states/i);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/catalog/extract.test.ts`
Expected: FAIL — cannot find module `./extract`.

- [ ] **Step 4: Write `src/catalog/extract.ts`**

```ts
import { CatalogBrand, CatalogCategory, CatalogModel, Generation } from './types';

interface FilterValue { id: string; name: string; counter: number }

interface FilterState {
  filterId: string;
  conditions?: { filterId: string; value: string }[];
  values?: { values?: FilterValue[] }[];
}

/** Pull every filters.states entry out of a page's __NEXT_DATA__. */
export function extractStates(html: string): FilterState[] {
  const match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('page has no __NEXT_DATA__ (blocked or unexpected page)');

  let urqlState: Record<string, { data?: unknown }>;
  try {
    urqlState = JSON.parse(match[1])?.props?.pageProps?.urqlState ?? {};
  } catch {
    throw new Error('page has no __NEXT_DATA__ (unparsable JSON)');
  }

  const states: FilterState[] = [];
  for (const entry of Object.values(urqlState)) {
    if (typeof entry?.data !== 'string') continue;
    try {
      const parsed = JSON.parse(entry.data);
      if (Array.isArray(parsed?.filters?.states)) states.push(...parsed.filters.states);
    } catch {
      // entry that isn't JSON filters data — skip
    }
  }
  if (states.length === 0) throw new Error('page carries no filter states');
  return states;
}

function condition(state: FilterState, filterId: string): string | undefined {
  return state.conditions?.find((c) => c.filterId === filterId)?.value;
}

function valuesOf(state: FilterState): FilterValue[] {
  return state.values?.[0]?.values ?? [];
}

/** Pure: page HTML → the full brand/model/generation tree for that category. */
export function extractCategory(html: string, crawledAt: string): CatalogCategory {
  const states = extractStates(html);

  const makeState = states.find((s) => s.filterId === 'filter_enum_make' && !condition(s, 'filter_enum_make'));
  if (!makeState) throw new Error('page carries no filter states for brands');

  const modelsByBrand = new Map<string, FilterValue[]>();
  const generationsByModel = new Map<string, Generation[]>();

  for (const state of states) {
    const brandSlug = condition(state, 'filter_enum_make');
    if (!brandSlug) continue;
    if (state.filterId === 'filter_enum_model') {
      modelsByBrand.set(brandSlug, valuesOf(state));
    } else if (state.filterId === 'filter_enum_generation') {
      const modelSlug = condition(state, 'filter_enum_model');
      if (!modelSlug) continue;
      generationsByModel.set(
        `${brandSlug}|${modelSlug}`,
        valuesOf(state).map((v) => ({ slug: v.id, name: v.name })),
      );
    }
  }

  const brands: CatalogBrand[] = valuesOf(makeState).map((brand) => {
    const models: CatalogModel[] = (modelsByBrand.get(brand.id) ?? []).map((model) => ({
      slug: model.id,
      name: model.name,
      count: model.counter ?? 0,
      generations: generationsByModel.get(`${brand.id}|${model.id}`) ?? [],
    }));
    return { slug: brand.id, name: brand.name, count: brand.counter ?? 0, crawledAt, models };
  });

  return { crawledAt, brands };
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run src/catalog/extract.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/catalog/extract.ts src/catalog/extract.test.ts src/catalog/__fixtures__/states.ts
git commit -m "feat(catalog): extract brands, models and generations from Otomoto page data"
```

---

## Task 3: Validation checks

**Files:**
- Create: `src/catalog/validate.ts`
- Create: `src/catalog/validate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/catalog/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateCategory, MINIMUMS } from './validate';
import { CatalogBrand, CatalogCategory } from './types';

const AT = '2026-09-16T10:00:00.000Z';

function brand(slug: string, count: number, models: [string, number][]): CatalogBrand {
  return {
    slug, name: slug, count, crawledAt: AT,
    models: models.map(([s, c]) => ({ slug: s, name: s, count: c, generations: [] })),
  };
}

/** A category that passes every check: enough brands and models, counts adding up. */
function healthy(brandCount = MINIMUMS.osobowe.brands, modelsPer = 12): CatalogCategory {
  const brands: CatalogBrand[] = [];
  for (let i = 0; i < brandCount; i++) {
    const models: [string, number][] = [];
    for (let m = 0; m < modelsPer; m++) models.push([`m${i}-${m}`, 10]);
    brands.push(brand(`b${i}`, modelsPer * 10, models));
  }
  return { crawledAt: AT, brands };
}

describe('validateCategory', () => {
  it('passes a complete category', () => {
    expect(validateCategory('osobowe', healthy(), null)).toEqual([]);
  });

  it('fails when there are too few brands', () => {
    const small = healthy(10);
    const problems = validateCategory('osobowe', small, null);
    expect(problems.map((p) => p.check)).toContain('minimum_size');
  });

  it('fails when there are too few models', () => {
    const thin = healthy(MINIMUMS.osobowe.brands, 1);
    expect(validateCategory('osobowe', thin, null).map((p) => p.check)).toContain('minimum_size');
  });

  it('fails a brand with listings but no models', () => {
    const c = healthy();
    c.brands[0].models = [];
    const problems = validateCategory('osobowe', c, null);
    expect(problems).toContainEqual(expect.objectContaining({ check: 'models_present', brand: 'b0' }));
  });

  it('accepts a brand with no models when it has no listings', () => {
    const c = healthy();
    c.brands[0].models = [];
    c.brands[0].count = 0;
    expect(validateCategory('osobowe', c, null)).toEqual([]);
  });

  it('fails when model counts do not add up to the brand count', () => {
    const c = healthy();
    c.brands[0].count = 500; // models only add up to 120
    expect(validateCategory('osobowe', c, null)).toContainEqual(
      expect.objectContaining({ check: 'totals', brand: 'b0' }),
    );
  });

  it('tolerates a small gap (listings with no model set)', () => {
    const c = healthy();
    c.brands[0].count = 120 + 5;
    expect(validateCategory('osobowe', c, null)).toEqual([]);
  });

  it('fails when a brand loses more than 20% of its models', () => {
    const previous = healthy();
    const now = healthy();
    now.brands[0].models = now.brands[0].models.slice(0, 9); // 12 → 9 = -25%
    now.brands[0].count = 90;
    expect(validateCategory('osobowe', now, previous)).toContainEqual(
      expect.objectContaining({ check: 'shrink', brand: 'b0' }),
    );
  });

  it('allows a small drop in a brand model list', () => {
    const previous = healthy();
    const now = healthy();
    now.brands[0].models = now.brands[0].models.slice(0, 11); // -8%
    now.brands[0].count = 110;
    expect(validateCategory('osobowe', now, previous)).toEqual([]);
  });

  it('fails when the category loses more than 5% of its brands', () => {
    const previous = healthy(200);
    const now = healthy(180); // -10%
    expect(validateCategory('osobowe', now, previous).map((p) => p.check)).toContain('shrink');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/catalog/validate.test.ts`
Expected: FAIL — cannot find module `./validate`.

- [ ] **Step 3: Write `src/catalog/validate.ts`**

```ts
import { CatalogCategory, CategoryId } from './types';

export interface Problem {
  check: 'minimum_size' | 'models_present' | 'totals' | 'shrink';
  brand?: string;
  message: string;
}

/** A crawl smaller than this means Otomoto returned a partial page. */
export const MINIMUMS: Record<CategoryId, { brands: number; models: number }> = {
  osobowe: { brands: 150, models: 1500 },
  'motocykle-i-quady': { brands: 150, models: 1500 },
};

const MAX_BRAND_MODEL_LOSS = 0.2;   // a brand may not lose more than 20% of its models
const MAX_CATEGORY_BRAND_LOSS = 0.05; // a category may not lose more than 5% of its brands

/** Listings without a model set: allow the larger of 5 or 0.1% of the brand's listings. */
function totalsTolerance(brandCount: number): number {
  return Math.max(5, Math.round(brandCount * 0.001));
}

/**
 * Pure: every reason this category must not be saved. Empty array = safe to save.
 * `previous` is the catalog currently on disk, or null on a first crawl.
 */
export function validateCategory(
  categoryId: CategoryId,
  category: CatalogCategory,
  previous: CatalogCategory | null,
): Problem[] {
  const problems: Problem[] = [];
  const minimum = MINIMUMS[categoryId];
  const totalModels = category.brands.reduce((sum, b) => sum + b.models.length, 0);

  if (category.brands.length < minimum.brands) {
    problems.push({
      check: 'minimum_size',
      message: `only ${category.brands.length} brands, expected at least ${minimum.brands}`,
    });
  }
  if (totalModels < minimum.models) {
    problems.push({
      check: 'minimum_size',
      message: `only ${totalModels} models, expected at least ${minimum.models}`,
    });
  }

  for (const brand of category.brands) {
    if (brand.count > 0 && brand.models.length === 0) {
      problems.push({ check: 'models_present', brand: brand.slug, message: `${brand.slug} has ${brand.count} listings but no models` });
      continue;
    }
    const sum = brand.models.reduce((s, m) => s + m.count, 0);
    if (Math.abs(brand.count - sum) > totalsTolerance(brand.count)) {
      problems.push({
        check: 'totals',
        brand: brand.slug,
        message: `${brand.slug}: brand count ${brand.count} but models add up to ${sum}`,
      });
    }
  }

  if (previous && previous.brands.length > 0) {
    if (category.brands.length < previous.brands.length * (1 - MAX_CATEGORY_BRAND_LOSS)) {
      problems.push({
        check: 'shrink',
        message: `brands dropped from ${previous.brands.length} to ${category.brands.length}`,
      });
    }
    const before = new Map(previous.brands.map((b) => [b.slug, b.models.length]));
    for (const brand of category.brands) {
      const had = before.get(brand.slug) ?? 0;
      if (had > 0 && brand.models.length < had * (1 - MAX_BRAND_MODEL_LOSS)) {
        problems.push({
          check: 'shrink',
          brand: brand.slug,
          message: `${brand.slug}: models dropped from ${had} to ${brand.models.length}`,
        });
      }
    }
  }

  return problems;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/catalog/validate.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/catalog/validate.ts src/catalog/validate.test.ts
git commit -m "feat(catalog): validation checks (size, model lists, totals, shrink guard)"
```

---

## Task 4: Merge one refreshed brand

**Files:**
- Create: `src/catalog/merge.ts`
- Create: `src/catalog/merge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/catalog/merge.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mergeBrand } from './merge';
import { Catalog, CatalogBrand, emptyCatalog } from './types';

const AT = '2026-09-16T10:00:00.000Z';

function brand(slug: string, models: string[], crawledAt = AT): CatalogBrand {
  return {
    slug, name: slug.toUpperCase(), count: models.length * 10, crawledAt,
    models: models.map((m) => ({ slug: m, name: m, count: 10, generations: [] })),
  };
}

function catalogWith(...brands: CatalogBrand[]): Catalog {
  const c = emptyCatalog();
  c.categories.osobowe = { crawledAt: AT, brands };
  return c;
}

describe('mergeBrand', () => {
  it('replaces the brand and reports added and removed models', () => {
    const before = catalogWith(brand('volkswagen', ['polo', 'golf']), brand('fiat', ['500']));
    const { catalog, added, removed } = mergeBrand(before, 'osobowe', brand('volkswagen', ['polo', 'taigo']));

    const vw = catalog.categories.osobowe.brands.find((b) => b.slug === 'volkswagen')!;
    expect(vw.models.map((m) => m.slug)).toEqual(['polo', 'taigo']);
    expect(added).toEqual(['taigo']);
    expect(removed).toEqual(['golf']);
  });

  it('leaves the other brands untouched and keeps brand order', () => {
    const before = catalogWith(brand('volkswagen', ['polo']), brand('fiat', ['500']));
    const { catalog } = mergeBrand(before, 'osobowe', brand('volkswagen', ['polo', 'golf']));
    expect(catalog.categories.osobowe.brands.map((b) => b.slug)).toEqual(['volkswagen', 'fiat']);
    expect(catalog.categories.osobowe.brands[1].models.map((m) => m.slug)).toEqual(['500']);
  });

  it('appends a brand that was not in the catalog yet', () => {
    const before = catalogWith(brand('volkswagen', ['polo']));
    const { catalog, added, removed } = mergeBrand(before, 'osobowe', brand('cupra', ['formentor']));
    expect(catalog.categories.osobowe.brands.map((b) => b.slug)).toEqual(['volkswagen', 'cupra']);
    expect(added).toEqual(['formentor']);
    expect(removed).toEqual([]);
  });

  it('does not change the catalog it was given', () => {
    const before = catalogWith(brand('volkswagen', ['polo']));
    mergeBrand(before, 'osobowe', brand('volkswagen', ['polo', 'golf']));
    expect(before.categories.osobowe.brands[0].models).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/catalog/merge.test.ts`
Expected: FAIL — cannot find module `./merge`.

- [ ] **Step 3: Write `src/catalog/merge.ts`**

```ts
import { Catalog, CatalogBrand, CategoryId } from './types';

export interface MergeResult {
  catalog: Catalog;
  added: string[];
  removed: string[];
}

/** Pure: return a new catalog with this brand replaced (or appended), plus the model diff. */
export function mergeBrand(catalog: Catalog, categoryId: CategoryId, brand: CatalogBrand): MergeResult {
  const category = catalog.categories[categoryId];
  const existing = category.brands.find((b) => b.slug === brand.slug);

  const had = new Set((existing?.models ?? []).map((m) => m.slug));
  const now = new Set(brand.models.map((m) => m.slug));
  const added = [...now].filter((slug) => !had.has(slug));
  const removed = [...had].filter((slug) => !now.has(slug));

  const brands = existing
    ? category.brands.map((b) => (b.slug === brand.slug ? brand : b))
    : [...category.brands, brand];

  return {
    catalog: {
      ...catalog,
      categories: { ...catalog.categories, [categoryId]: { ...category, brands } },
    },
    added,
    removed,
  };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/catalog/merge.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/catalog/merge.ts src/catalog/merge.test.ts
git commit -m "feat(catalog): merge a refreshed brand and report the model diff"
```

---

## Task 5: Catalog storage

**Files:**
- Create: `src/catalog/store.ts`
- Create: `src/catalog/store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/catalog/store.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadCatalog, saveCatalog, catalogPath } from './store';
import { emptyCatalog } from './types';

let dir: string;

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('loadCatalog', () => {
  it('returns null when there is no catalog yet', () => {
    expect(loadCatalog(dir)).toBeNull();
  });
  it('returns null for an unreadable catalog instead of throwing', () => {
    fs.writeFileSync(catalogPath(dir), '{ this is not json');
    expect(loadCatalog(dir)).toBeNull();
  });
  it('reads back what was saved', () => {
    const c = emptyCatalog();
    c.categories.osobowe = { crawledAt: 'now', brands: [{ slug: 'vw', name: 'VW', count: 1, crawledAt: 'now', models: [] }] };
    saveCatalog(dir, c);
    expect(loadCatalog(dir)).toEqual(c);
  });
});

describe('saveCatalog', () => {
  it('creates the directory if missing', () => {
    const nested = path.join(dir, 'data');
    saveCatalog(nested, emptyCatalog());
    expect(fs.existsSync(catalogPath(nested))).toBe(true);
  });
  it('keeps the previous catalog as .bak', () => {
    const first = emptyCatalog();
    first.categories.osobowe.crawledAt = 'first';
    saveCatalog(dir, first);
    const second = emptyCatalog();
    second.categories.osobowe.crawledAt = 'second';
    saveCatalog(dir, second);

    expect(loadCatalog(dir)!.categories.osobowe.crawledAt).toBe('second');
    const bak = JSON.parse(fs.readFileSync(catalogPath(dir) + '.bak', 'utf8'));
    expect(bak.categories.osobowe.crawledAt).toBe('first');
  });
  it('leaves no temp file behind', () => {
    saveCatalog(dir, emptyCatalog());
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/catalog/store.test.ts`
Expected: FAIL — cannot find module `./store`.

- [ ] **Step 3: Write `src/catalog/store.ts`**

```ts
import * as fs from 'fs';
import * as path from 'path';
import { Catalog } from './types';

/** Where the catalog lives in production. */
export const DEFAULT_DIR = path.join(process.cwd(), 'data');

export function catalogPath(dir: string = DEFAULT_DIR): string {
  return path.join(dir, 'catalog.json');
}

/** Read the catalog, or null when it is missing or unreadable. */
export function loadCatalog(dir: string = DEFAULT_DIR): Catalog | null {
  try {
    return JSON.parse(fs.readFileSync(catalogPath(dir), 'utf8')) as Catalog;
  } catch {
    return null;
  }
}

/** Write atomically: temp file → rename, keeping the previous catalog as .bak. */
export function saveCatalog(dir: string = DEFAULT_DIR, catalog: Catalog): void {
  const file = catalogPath(dir);
  fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(file)) {
    fs.copyFileSync(file, `${file}.bak`);
  }

  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(catalog), 'utf8');
  fs.renameSync(tmp, file);
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/catalog/store.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/catalog/store.ts src/catalog/store.test.ts
git commit -m "feat(catalog): atomic catalog storage with .bak"
```

---

## Task 6: Fetch Otomoto pages through the proxy

**Files:**
- Create: `src/catalog/fetch-page.ts`
- Create: `src/catalog/fetch-page.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/catalog/fetch-page.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildProxyUrl, categoryUrl, brandUrl } from './fetch-page';

const saved = { url: process.env.PROXY_URL, user: process.env.PROXY_USER, pass: process.env.PROXY_PASS };

beforeEach(() => { delete process.env.PROXY_URL; delete process.env.PROXY_USER; delete process.env.PROXY_PASS; });
afterEach(() => {
  process.env.PROXY_URL = saved.url; process.env.PROXY_USER = saved.user; process.env.PROXY_PASS = saved.pass;
});

describe('buildProxyUrl', () => {
  it('returns null when no proxy is configured', () => {
    expect(buildProxyUrl()).toBeNull();
  });
  it('builds a proxy url with credentials', () => {
    process.env.PROXY_URL = '1.2.3.4:6754';
    process.env.PROXY_USER = 'user';
    process.env.PROXY_PASS = 'pass';
    expect(buildProxyUrl()).toBe('http://user:pass@1.2.3.4:6754');
  });
  it('strips a scheme already present in PROXY_URL', () => {
    process.env.PROXY_URL = 'http://1.2.3.4:6754';
    expect(buildProxyUrl()).toBe('http://1.2.3.4:6754');
  });
});

describe('urls', () => {
  it('builds the category url', () => {
    expect(categoryUrl('osobowe')).toBe('https://www.otomoto.pl/osobowe');
    expect(categoryUrl('motocykle-i-quady')).toBe('https://www.otomoto.pl/motocykle-i-quady');
  });
  it('builds the brand url from the Otomoto slug', () => {
    expect(brandUrl('osobowe', 'volkswagen')).toBe('https://www.otomoto.pl/osobowe/volkswagen');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/catalog/fetch-page.test.ts`
Expected: FAIL — cannot find module `./fetch-page`.

- [ ] **Step 3: Write `src/catalog/fetch-page.ts`**

```ts
import { ProxyAgent } from 'undici';
import { CategoryId } from './types';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function categoryUrl(category: CategoryId): string {
  return `https://www.otomoto.pl/${category}`;
}

export function brandUrl(category: CategoryId, brandSlug: string): string {
  return `https://www.otomoto.pl/${category}/${brandSlug}`;
}

/** Same proxy convention as the price scraper: PROXY_URL (+ optional PROXY_USER/PROXY_PASS). */
export function buildProxyUrl(): string | null {
  const proxyUrl = process.env.PROXY_URL;
  if (!proxyUrl) return null;
  const bare = proxyUrl.replace(/^https?:\/\//, '');
  const user = process.env.PROXY_USER;
  const pass = process.env.PROXY_PASS;
  return user && pass ? `http://${user}:${pass}@${bare}` : `http://${bare}`;
}

/** How the catalog code reaches Otomoto; injected in tests. */
export type PageFetcher = (url: string) => Promise<string>;

/** Fetch a page as HTML, retrying transient failures. Throws when every attempt fails. */
export async function fetchOtomotoPage(url: string, retries = 3): Promise<string> {
  const proxy = buildProxyUrl();
  const options: Record<string, unknown> = {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pl-PL,pl;q=0.9', Accept: 'text/html' },
    redirect: 'follow',
  };
  if (proxy) options.dispatcher = new ProxyAgent(proxy);

  let lastError = '';
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options as RequestInit);
      if (response.ok) return await response.text();
      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = (err as Error).message;
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw new Error(`could not fetch ${url}: ${lastError}`);
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/catalog/fetch-page.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/catalog/fetch-page.ts src/catalog/fetch-page.test.ts
git commit -m "feat(catalog): Otomoto page fetcher with proxy support"
```

---

## Task 7: Crawl both categories with per-brand retry

**Files:**
- Create: `src/catalog/crawl.ts`
- Create: `src/catalog/crawl.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/catalog/crawl.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { crawlCatalog } from './crawl';
import { CAR_STATES, MOTO_STATES, pageHtml } from './__fixtures__/states';

const AT = '2026-09-16T10:00:00.000Z';

/** Pad the fixture up to the validation minimums so healthy crawls pass the checks. */
function bigStates(base: any[], prefix: string, brands = 160, modelsPer = 12) {
  const value = (id: string, name: string, counter: number) => ({ id, name, counter });
  const makes = [] as any[];
  const modelStates = [] as any[];
  for (let i = 0; i < brands; i++) {
    makes.push(value(`${prefix}${i}`, `${prefix}${i}`, modelsPer * 10));
    modelStates.push({
      filterId: 'filter_enum_model',
      conditions: [{ filterId: 'filter_enum_make', value: `${prefix}${i}` }],
      values: [{ values: Array.from({ length: modelsPer }, (_, m) => value(`${prefix}${i}-m${m}`, `m${m}`, 10)) }],
    });
  }
  const baseMakes = base.find((s) => s.filterId === 'filter_enum_make').values[0].values;
  return [
    { filterId: 'filter_enum_make', conditions: [], values: [{ values: [...baseMakes, ...makes] }] },
    ...base.filter((s) => s.filterId !== 'filter_enum_make'),
    ...modelStates,
  ];
}

const carsHtml = pageHtml(bigStates(CAR_STATES, 'car'));
const motoHtml = pageHtml(bigStates(MOTO_STATES, 'moto'));

function fetcherFor(pages: Record<string, string>) {
  const calls: string[] = [];
  const fetchPage = async (url: string) => {
    calls.push(url);
    const page = pages[url];
    if (!page) throw new Error(`unexpected url ${url}`);
    return page;
  };
  return { fetchPage, calls };
}

const HEALTHY_PAGES = {
  'https://www.otomoto.pl/osobowe': carsHtml,
  'https://www.otomoto.pl/motocykle-i-quady': motoHtml,
};

describe('crawlCatalog', () => {
  it('crawls both categories with one request each', async () => {
    const { fetchPage, calls } = fetcherFor(HEALTHY_PAGES);
    const result = await crawlCatalog({ fetchPage, now: () => AT, previous: null });

    expect(calls).toEqual([
      'https://www.otomoto.pl/osobowe',
      'https://www.otomoto.pl/motocykle-i-quady',
    ]);
    expect(result.problems).toEqual([]);
    expect(result.catalog.categories.osobowe.brands.length).toBeGreaterThan(150);
    expect(result.catalog.categories['motocykle-i-quady'].brands.length).toBeGreaterThan(150);
    const vw = result.catalog.categories.osobowe.brands.find((b) => b.slug === 'volkswagen')!;
    expect(vw.models.map((m) => m.slug)).toContain('polo');
  });

  it('re-reads a failing brand from its own page and keeps the better result', async () => {
    // Break volkswagen on the category page: listings but no models.
    const brokenStates = bigStates(CAR_STATES, 'car').filter(
      (s) => !(s.filterId === 'filter_enum_model' && s.conditions?.[0]?.value === 'volkswagen'),
    );
    const brandStates = [
      { filterId: 'filter_enum_make', conditions: [], values: [{ values: [{ id: 'volkswagen', name: 'Volkswagen', counter: 300 }] }] },
      ...CAR_STATES.filter((s) => s.conditions?.[0]?.value === 'volkswagen'),
    ];
    const { fetchPage, calls } = fetcherFor({
      ...HEALTHY_PAGES,
      'https://www.otomoto.pl/osobowe': pageHtml(brokenStates),
      'https://www.otomoto.pl/osobowe/volkswagen': pageHtml(brandStates),
    });

    const result = await crawlCatalog({ fetchPage, now: () => AT, previous: null });

    expect(calls).toContain('https://www.otomoto.pl/osobowe/volkswagen');
    expect(result.problems).toEqual([]);
    const vw = result.catalog.categories.osobowe.brands.find((b) => b.slug === 'volkswagen')!;
    expect(vw.models.map((m) => m.slug)).toEqual(['polo', 'golf', 'buggy']);
  });

  it('reports problems that survive the brand retry', async () => {
    const brokenStates = bigStates(CAR_STATES, 'car').filter(
      (s) => !(s.filterId === 'filter_enum_model' && s.conditions?.[0]?.value === 'volkswagen'),
    );
    const { fetchPage } = fetcherFor({
      ...HEALTHY_PAGES,
      'https://www.otomoto.pl/osobowe': pageHtml(brokenStates),
      'https://www.otomoto.pl/osobowe/volkswagen': pageHtml(brokenStates), // still no models
    });

    const result = await crawlCatalog({ fetchPage, now: () => AT, previous: null });
    expect(result.problems.map((p) => p.check)).toContain('models_present');
  });

  it('fails the whole crawl when a category page cannot be fetched', async () => {
    const { fetchPage } = fetcherFor({ 'https://www.otomoto.pl/osobowe': carsHtml });
    await expect(crawlCatalog({ fetchPage, now: () => AT, previous: null })).rejects.toThrow(/motocykle/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/catalog/crawl.test.ts`
Expected: FAIL — cannot find module `./crawl`.

- [ ] **Step 3: Write `src/catalog/crawl.ts`**

```ts
import { extractCategory } from './extract';
import { validateCategory, Problem } from './validate';
import { mergeBrand } from './merge';
import { PageFetcher, categoryUrl, brandUrl } from './fetch-page';
import { Catalog, CATEGORY_IDS, CategoryId, emptyCatalog } from './types';

export interface CrawlOptions {
  fetchPage: PageFetcher;
  /** ISO timestamp factory — injected so tests are deterministic. */
  now?: () => string;
  /** Catalog currently on disk, used by the shrink check. */
  previous: Catalog | null;
}

export interface CrawlResult {
  catalog: Catalog;
  problems: Problem[];
}

/** Read one brand from its own page — the fallback when the category page came back thin. */
export async function refreshBrand(
  fetchPage: PageFetcher,
  categoryId: CategoryId,
  brandSlug: string,
  crawledAt: string,
) {
  const html = await fetchPage(brandUrl(categoryId, brandSlug));
  const category = extractCategory(html, crawledAt);
  const brand = category.brands.find((b) => b.slug === brandSlug);
  if (!brand) throw new Error(`brand ${brandSlug} not found on its own page`);
  return brand;
}

/**
 * Crawl both categories. Brands that fail a check are re-read from their own page once;
 * whatever still fails is reported. Throws only when a category page can't be read at all.
 */
export async function crawlCatalog(options: CrawlOptions): Promise<CrawlResult> {
  const now = options.now ?? (() => new Date().toISOString());
  let catalog = emptyCatalog();
  const problems: Problem[] = [];

  for (const categoryId of CATEGORY_IDS) {
    const crawledAt = now();
    let html: string;
    try {
      html = await options.fetchPage(categoryUrl(categoryId));
    } catch (err) {
      throw new Error(`category ${categoryId}: ${(err as Error).message}`);
    }

    catalog.categories[categoryId] = extractCategory(html, crawledAt);
    const previousCategory = options.previous?.categories[categoryId] ?? null;
    let found = validateCategory(categoryId, catalog.categories[categoryId], previousCategory);

    // Retry each failing brand from its own page.
    const failingBrands = [...new Set(found.filter((p) => p.brand).map((p) => p.brand!))];
    for (const brandSlug of failingBrands) {
      try {
        const brand = await refreshBrand(options.fetchPage, categoryId, brandSlug, crawledAt);
        catalog = mergeBrand(catalog, categoryId, brand).catalog;
      } catch (err) {
        console.warn(`[catalog] retry for ${categoryId}/${brandSlug} failed: ${(err as Error).message}`);
      }
    }

    if (failingBrands.length > 0) {
      found = validateCategory(categoryId, catalog.categories[categoryId], previousCategory);
    }
    problems.push(...found);
  }

  return { catalog, problems };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/catalog/crawl.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/catalog/crawl.ts src/catalog/crawl.test.ts
git commit -m "feat(catalog): crawl both categories with per-brand retry"
```

---

## Task 8: Generate the two /js files from the catalog

`public/index.html` loads `/js/brands-models.js` and `/js/generations.js` and `app.js` uses the globals
`BRANDS_MODELS`, `MODEL_TO_BRAND`, `ALL_BRANDS`, `ALL_MODELS` and `GENERATIONS`. These generators must
produce exactly those globals.

**Files:**
- Create: `src/catalog/js-files.ts`
- Create: `src/catalog/js-files.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/catalog/js-files.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { brandsModelsJs, generationsJs } from './js-files';
import { Catalog, emptyCatalog } from './types';

const AT = '2026-09-16T10:00:00.000Z';

function sample(): Catalog {
  const c = emptyCatalog();
  c.categories.osobowe = {
    crawledAt: AT,
    brands: [
      { slug: 'volkswagen', name: 'Volkswagen', count: 300, crawledAt: AT, models: [
        { slug: 'polo', name: 'Polo', count: 120, generations: [{ slug: 'gen-v-2009-2017', name: 'V (2009-2017)' }] },
        { slug: 'golf', name: 'Golf', count: 180, generations: [] },
      ] },
      { slug: 'fiat', name: 'Fiat', count: 50, crawledAt: AT, models: [{ slug: '500', name: '500', count: 50, generations: [] }] },
    ],
  };
  c.categories['motocykle-i-quady'] = {
    crawledAt: AT,
    brands: [{ slug: 'yamaha', name: 'Yamaha', count: 90, crawledAt: AT, models: [{ slug: 'fz6', name: 'FZ6', count: 60, generations: [] }] }],
  };
  return c;
}

/** Run generated code the way the browser would and read the globals back. */
function evalGlobals(js: string, names: string[]): Record<string, any> {
  const fn = new Function(`${js}\nreturn { ${names.join(', ')} };`);
  return fn();
}

describe('brandsModelsJs', () => {
  const js = brandsModelsJs(sample());
  const g = evalGlobals(js, ['BRANDS_MODELS', 'MODEL_TO_BRAND', 'ALL_BRANDS', 'ALL_MODELS', 'BRANDS_MODELS_MOTO']);

  it('builds BRANDS_MODELS from car brands with Otomoto display names', () => {
    expect(g.BRANDS_MODELS).toEqual({ Fiat: ['500'], Volkswagen: ['Golf', 'Polo'] });
  });
  it('sorts brands and models the way the form expects', () => {
    expect(g.ALL_BRANDS).toEqual(['Fiat', 'Volkswagen']);
    expect(g.ALL_MODELS.map((m: any) => m.model)).toEqual(['500', 'Golf', 'Polo']);
  });
  it('maps model to brand', () => {
    expect(g.MODEL_TO_BRAND['polo']).toBe('Volkswagen');
  });
  it('exposes motorcycle brands separately', () => {
    expect(g.BRANDS_MODELS_MOTO).toEqual({ Yamaha: ['FZ6'] });
  });
});

describe('generationsJs', () => {
  it('builds GENERATIONS for models that have them', () => {
    const g = evalGlobals(generationsJs(sample()), ['GENERATIONS']);
    expect(g.GENERATIONS).toEqual({
      Volkswagen: { Polo: [{ name: 'V (2009-2017)', slug: 'gen-v-2009-2017' }] },
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/catalog/js-files.test.ts`
Expected: FAIL — cannot find module `./js-files`.

- [ ] **Step 3: Write `src/catalog/js-files.ts`**

```ts
import { Catalog, CatalogCategory } from './types';

const byName = (a: string, b: string) => a.localeCompare(b, 'pl');

function brandsModelsMap(category: CatalogCategory): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const brand of [...category.brands].sort((a, b) => byName(a.name, b.name))) {
    map[brand.name] = brand.models.map((m) => m.name).sort(byName);
  }
  return map;
}

/** The globals public/js/app.js expects, generated from the catalog. */
export function brandsModelsJs(catalog: Catalog): string {
  const cars = brandsModelsMap(catalog.categories.osobowe);
  const moto = brandsModelsMap(catalog.categories['motocykle-i-quady']);

  return `// Generated from data/catalog.json — do not edit by hand.
const BRANDS_MODELS = ${JSON.stringify(cars)};
const BRANDS_MODELS_MOTO = ${JSON.stringify(moto)};

const MODEL_TO_BRAND = {};
for (const [brand, models] of Object.entries(BRANDS_MODELS)) {
  for (const model of models) {
    const key = model.toLowerCase();
    if (!MODEL_TO_BRAND[key]) MODEL_TO_BRAND[key] = brand;
  }
}

const ALL_BRANDS = Object.keys(BRANDS_MODELS).sort((a, b) => a.localeCompare(b, 'pl'));

const ALL_MODELS = [];
for (const [brand, models] of Object.entries(BRANDS_MODELS)) {
  for (const model of models) ALL_MODELS.push({ brand, model });
}
ALL_MODELS.sort((a, b) => a.model.localeCompare(b.model, 'pl'));
`;
}

export function generationsJs(catalog: Catalog): string {
  const generations: Record<string, Record<string, { name: string; slug: string }[]>> = {};
  for (const brand of catalog.categories.osobowe.brands) {
    for (const model of brand.models) {
      if (model.generations.length === 0) continue;
      if (!generations[brand.name]) generations[brand.name] = {};
      generations[brand.name][model.name] = model.generations.map((g) => ({ name: g.name, slug: g.slug }));
    }
  }
  return `// Generated from data/catalog.json — do not edit by hand.
const GENERATIONS = ${JSON.stringify(generations)};
`;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/catalog/js-files.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/catalog/js-files.ts src/catalog/js-files.test.ts
git commit -m "feat(catalog): generate brands-models.js and generations.js from the catalog"
```

---

## Task 9: Catalog routes

**Files:**
- Create: `src/routes/catalog.ts`
- Create: `src/routes/catalog.test.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Write the failing test**

Create `src/routes/catalog.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createCatalogRouter, REFRESH_COOLDOWN_MS } from './catalog';
import { saveCatalog, loadCatalog } from '../catalog/store';
import { Catalog, emptyCatalog } from '../catalog/types';
import { CAR_STATES, pageHtml } from '../catalog/__fixtures__/states';

const AT = '2026-09-16T10:00:00.000Z';
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-routes-'));
  const c: Catalog = emptyCatalog();
  c.categories.osobowe = {
    crawledAt: AT,
    brands: [{ slug: 'volkswagen', name: 'Volkswagen', count: 300, crawledAt: AT, models: [
      { slug: 'polo', name: 'Polo', count: 120, generations: [] },
      { slug: 'golf', name: 'Golf', count: 180, generations: [] },
    ] }],
  };
  saveCatalog(dir, c);
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

/** Minimal Express-like req/res so the handlers can be called directly. */
function call(handler: any, req: any) {
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    type: '',
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
    set(_k: string, v: string) { this.type = v; return this; },
    send(payload: any) { this.body = payload; return this; },
  };
  return handler({ query: {}, body: {}, ...req }, res).then?.(() => res) ?? Promise.resolve(res);
}

describe('GET /api/catalog', () => {
  it('returns the whole catalog', async () => {
    const router = createCatalogRouter({ dir, fetchPage: async () => '' });
    const res = await call(router.handlers.getCatalog, {});
    expect(res.body.success).toBe(true);
    expect(res.body.catalog.categories.osobowe.brands).toHaveLength(1);
  });

  it('returns one brand when asked', async () => {
    const router = createCatalogRouter({ dir, fetchPage: async () => '' });
    const res = await call(router.handlers.getCatalog, { query: { category: 'osobowe', brand: 'Volkswagen' } });
    expect(res.body.brand.models.map((m: any) => m.slug)).toEqual(['polo', 'golf']);
  });

  it('404s an unknown brand', async () => {
    const router = createCatalogRouter({ dir, fetchPage: async () => '' });
    const res = await call(router.handlers.getCatalog, { query: { category: 'osobowe', brand: 'Trabant' } });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/catalog/refresh', () => {
  const brandPage = pageHtml(CAR_STATES);

  it('merges the refreshed brand and reports the diff', async () => {
    const router = createCatalogRouter({ dir, fetchPage: async () => brandPage, now: () => AT });
    const res = await call(router.handlers.refresh, { body: { category: 'osobowe', brand: 'Volkswagen' } });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, models: 3, added: ['buggy'], removed: [] });
    const vw = loadCatalog(dir)!.categories.osobowe.brands[0];
    expect(vw.models.map((m) => m.slug)).toEqual(['polo', 'golf', 'buggy']);
  });

  it('refuses a second refresh of the same brand within the cooldown', async () => {
    const router = createCatalogRouter({ dir, fetchPage: async () => brandPage, now: () => AT });
    await call(router.handlers.refresh, { body: { category: 'osobowe', brand: 'Volkswagen' } });
    const res = await call(router.handlers.refresh, { body: { category: 'osobowe', brand: 'Volkswagen' } });
    expect(res.statusCode).toBe(429);
    expect(REFRESH_COOLDOWN_MS).toBe(10 * 60 * 1000);
  });

  it('503s and keeps the catalog when Otomoto cannot be read', async () => {
    const router = createCatalogRouter({ dir, fetchPage: async () => { throw new Error('HTTP 403'); } });
    const res = await call(router.handlers.refresh, { body: { category: 'osobowe', brand: 'Volkswagen' } });
    expect(res.statusCode).toBe(503);
    expect(loadCatalog(dir)!.categories.osobowe.brands[0].models).toHaveLength(2);
  });

  it('409s and keeps the catalog when the refreshed brand fails a check', async () => {
    // A page whose volkswagen has listings but no models.
    const thin = CAR_STATES.filter((s) => !(s.filterId === 'filter_enum_model' && s.conditions?.[0]?.value === 'volkswagen'));
    const router = createCatalogRouter({ dir, fetchPage: async () => pageHtml(thin) });
    const res = await call(router.handlers.refresh, { body: { category: 'osobowe', brand: 'Volkswagen' } });
    expect(res.statusCode).toBe(409);
    expect(loadCatalog(dir)!.categories.osobowe.brands[0].models).toHaveLength(2);
  });

  it('400s an unknown category', async () => {
    const router = createCatalogRouter({ dir, fetchPage: async () => brandPage });
    const res = await call(router.handlers.refresh, { body: { category: 'ciezarowe', brand: 'Volkswagen' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('generated js files', () => {
  it('serves brands-models.js built from the catalog', async () => {
    const router = createCatalogRouter({ dir, fetchPage: async () => '' });
    const res = await call(router.handlers.brandsModelsJs, {});
    expect(res.type).toBe('application/javascript; charset=utf-8');
    expect(res.body).toContain('const BRANDS_MODELS =');
    expect(res.body).toContain('Polo');
  });

  it('hands over to the static file when there is no catalog', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-none-'));
    const router = createCatalogRouter({ dir: empty, fetchPage: async () => '' });
    let handedOver = false;
    const res: any = { set() { return this; }, send(b: any) { this.body = b; return this; } };
    await router.handlers.brandsModelsJs({} as any, res, () => { handedOver = true; });
    expect(handedOver).toBe(true); // express.static then serves public/js/brands-models.js
    expect(res.body).toBeUndefined();
    fs.rmSync(empty, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/routes/catalog.test.ts`
Expected: FAIL — cannot find module `./catalog`.

- [ ] **Step 3: Write `src/routes/catalog.ts`**

```ts
import { Router, Request, Response, NextFunction } from 'express';
import { loadCatalog, saveCatalog, DEFAULT_DIR } from '../catalog/store';
import { extractCategory } from '../catalog/extract';
import { validateCategory } from '../catalog/validate';
import { mergeBrand } from '../catalog/merge';
import { brandsModelsJs, generationsJs } from '../catalog/js-files';
import { fetchOtomotoPage, PageFetcher, brandUrl } from '../catalog/fetch-page';
import { CategoryId, isCategoryId, emptyCatalog } from '../catalog/types';

/** One refresh per brand per 10 minutes — the page is public and each refresh costs a proxy request. */
export const REFRESH_COOLDOWN_MS = 10 * 60 * 1000;

interface Options {
  dir?: string;
  fetchPage?: PageFetcher;
  now?: () => string;
}

export function createCatalogRouter(options: Options = {}) {
  const dir = options.dir ?? DEFAULT_DIR;
  const fetchPage = options.fetchPage ?? fetchOtomotoPage;
  const now = options.now ?? (() => new Date().toISOString());
  const lastRefresh = new Map<string, number>();

  async function getCatalog(req: Request, res: Response) {
    const catalog = loadCatalog(dir);
    if (!catalog) {
      res.status(404).json({ success: false, error: 'Katalog nie został jeszcze pobrany.' });
      return;
    }
    const category = String(req.query.category ?? 'osobowe');
    const brandName = req.query.brand ? String(req.query.brand) : null;
    if (!brandName) {
      res.json({ success: true, catalog });
      return;
    }
    if (!isCategoryId(category)) {
      res.status(400).json({ success: false, error: `Nieznana kategoria: ${category}` });
      return;
    }
    const brand = catalog.categories[category].brands.find(
      (b) => b.name.toLowerCase() === brandName.toLowerCase() || b.slug === brandName.toLowerCase(),
    );
    if (!brand) {
      res.status(404).json({ success: false, error: `Nieznana marka: ${brandName}` });
      return;
    }
    res.json({ success: true, brand });
  }

  async function refresh(req: Request, res: Response) {
    const category = String(req.body.category ?? 'osobowe');
    const brandName = String(req.body.brand ?? '').trim();

    if (!isCategoryId(category)) {
      res.status(400).json({ success: false, error: `Nieznana kategoria: ${category}` });
      return;
    }
    if (!brandName) {
      res.status(400).json({ success: false, error: 'Podaj markę.' });
      return;
    }

    const catalog = loadCatalog(dir) ?? emptyCatalog();
    const categoryId = category as CategoryId;
    const known = catalog.categories[categoryId].brands.find(
      (b) => b.name.toLowerCase() === brandName.toLowerCase() || b.slug === brandName.toLowerCase(),
    );
    const brandSlug = known?.slug ?? brandName.toLowerCase().replace(/\s+/g, '-');

    const key = `${categoryId}|${brandSlug}`;
    const last = lastRefresh.get(key);
    if (last && Date.now() - last < REFRESH_COOLDOWN_MS) {
      const wait = Math.ceil((REFRESH_COOLDOWN_MS - (Date.now() - last)) / 60000);
      res.status(429).json({ success: false, error: `Odświeżono niedawno — spróbuj za ${wait} min.` });
      return;
    }

    let brand;
    try {
      const html = await fetchPage(brandUrl(categoryId, brandSlug));
      const fresh = extractCategory(html, now());
      brand = fresh.brands.find((b) => b.slug === brandSlug);
    } catch (err) {
      res.status(503).json({ success: false, error: `Otomoto nie odpowiada: ${(err as Error).message}` });
      return;
    }

    if (!brand) {
      res.status(404).json({ success: false, error: `Nieznana marka: ${brandName}` });
      return;
    }

    const merged = mergeBrand(catalog, categoryId, brand);
    const problems = validateCategory(categoryId, merged.catalog.categories[categoryId], catalog.categories[categoryId])
      .filter((p) => p.brand === brandSlug);
    if (problems.length > 0) {
      res.status(409).json({ success: false, error: `Dane z Otomoto wyglądają niekompletnie: ${problems[0].message}` });
      return;
    }

    saveCatalog(dir, merged.catalog);
    lastRefresh.set(key, Date.now());
    res.json({
      success: true,
      brand: brand.name,
      models: brand.models.length,
      added: merged.added,
      removed: merged.removed,
      crawledAt: brand.crawledAt,
    });
  }

  function sendJs(res: Response, next: NextFunction, body: string | null) {
    if (!body) {
      // No catalog yet — hand over to express.static, which serves public/js/<file>.
      next();
      return;
    }
    res.set('Content-Type', 'application/javascript; charset=utf-8').send(body);
  }

  async function brandsModelsJsHandler(_req: Request, res: Response, next: NextFunction) {
    const catalog = loadCatalog(dir);
    sendJs(res, next, catalog ? brandsModelsJs(catalog) : null);
  }

  async function generationsJsHandler(_req: Request, res: Response, next: NextFunction) {
    const catalog = loadCatalog(dir);
    sendJs(res, next, catalog ? generationsJs(catalog) : null);
  }

  const router = Router();
  router.get('/api/catalog', getCatalog);
  router.post('/api/catalog/refresh', refresh);
  router.get('/js/brands-models.js', brandsModelsJsHandler);
  router.get('/js/generations.js', generationsJsHandler);

  return {
    router,
    handlers: {
      getCatalog,
      refresh,
      brandsModelsJs: brandsModelsJsHandler,
      generationsJs: generationsJsHandler,
    },
  };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/routes/catalog.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Mount the router before the static middleware**

In `src/server.ts`, replace lines 1-17 with:

```ts
import express from 'express';
import path from 'path';
import estimateRouter from './routes/estimate';
import optionsRouter from './routes/options';
import { createCatalogRouter } from './routes/catalog';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Catalog routes first: /js/brands-models.js and /js/generations.js are generated from
// data/catalog.json, and fall through (404) to the static files when there is no catalog.
app.use(createCatalogRouter().router);

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/estimate', estimateRouter);
app.use('/api/options', optionsRouter);
```

- [ ] **Step 6: Check the whole suite and the build**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass; no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/routes/catalog.ts src/routes/catalog.test.ts src/server.ts
git commit -m "feat(catalog): catalog API, per-brand refresh and generated js files"
```

---

## Task 10: Crawl script

**Files:**
- Create: `scripts/crawl-catalog.ts`

- [ ] **Step 1: Write the script**

```ts
/**
 * Full Otomoto catalog crawl: brands, models and generations for cars and motorcycles.
 *
 *   npm run crawl-catalog            # crawl, validate, save
 *   npm run crawl-catalog -- --dry   # crawl and report, save nothing
 *
 * Needs PROXY_URL / PROXY_USER / PROXY_PASS in the environment (same as the price scraper).
 */
import { crawlCatalog } from '../src/catalog/crawl';
import { fetchOtomotoPage } from '../src/catalog/fetch-page';
import { loadCatalog, saveCatalog, catalogPath } from '../src/catalog/store';
import { CATEGORY_IDS } from '../src/catalog/types';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry');
  const previous = loadCatalog();

  console.log('=== Otomoto catalog crawl ===');
  console.log(previous ? 'Previous catalog loaded (shrink checks active).' : 'No previous catalog — first crawl.');

  const { catalog, problems } = await crawlCatalog({ fetchPage: fetchOtomotoPage, previous });

  for (const categoryId of CATEGORY_IDS) {
    const category = catalog.categories[categoryId];
    const models = category.brands.reduce((sum, b) => sum + b.models.length, 0);
    const generations = category.brands.reduce(
      (sum, b) => sum + b.models.reduce((s, m) => s + m.generations.length, 0), 0);
    console.log(`${categoryId}: ${category.brands.length} brands, ${models} models, ${generations} generations`);
  }

  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s) — catalog NOT saved:`);
    for (const p of problems.slice(0, 20)) console.error(`  [${p.check}] ${p.message}`);
    if (problems.length > 20) console.error(`  ... and ${problems.length - 20} more`);
    process.exit(1);
  }

  if (dryRun) {
    console.log('\n--dry: nothing written.');
    return;
  }

  saveCatalog(undefined, catalog);
  console.log(`\nSaved ${catalogPath()}`);
}

main().catch((err) => {
  console.error('Crawl failed:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Run it against Otomoto without saving**

Run: `npx ts-node scripts/crawl-catalog.ts --dry`
Expected: roughly `osobowe: 190 brands, 2563 models, 323 generations` and
`motocykle-i-quady: 263 brands, 3066 models, 0 generations`, no problems, nothing written.
(If Otomoto blocks the local IP, run this step on the server in Task 12 instead.)

- [ ] **Step 3: Commit**

```bash
git add scripts/crawl-catalog.ts
git commit -m "feat(catalog): full crawl script with report and dry run"
```

---

## Task 11: "Odśwież modele marki" button

**Files:**
- Modify: `public/index.html` (next to the existing `fetchOptionsBtn`)
- Modify: `public/js/app.js`

- [ ] **Step 1: Find the existing button**

Run: `grep -n "fetchOptionsBtn\|Odśwież dane\|Pobierz dane" public/index.html public/js/app.js | head -20`
Expected: the button element in `index.html` and its handler in `app.js` (around line 349).

- [ ] **Step 2: Add the button to `public/index.html`**

Directly after the element whose id is `fetchOptionsBtn`, add:

```html
      <button type="button" id="refreshBrandModelsBtn" class="secondary-btn">Odśwież modele marki</button>
      <span id="brandModelsInfo" class="hint"></span>
```

(Use the same class as `fetchOptionsBtn` so it matches the existing styling — copy whatever class that
element has. `app.js` has `showError`/`hideError` but no "info" helper, hence the small span.)

- [ ] **Step 3: Add the handler in `public/js/app.js`**

At the end of the file, add:

```js
// ============================================================
// Refresh the model list of one brand from Otomoto
// ============================================================

const refreshBrandModelsBtn = document.getElementById('refreshBrandModelsBtn');
const brandModelsInfo = document.getElementById('brandModelsInfo');

refreshBrandModelsBtn.addEventListener('click', async () => {
  const brand = brandSelect.value;
  if (!brand) {
    showError('Wybierz markę, aby odświeżyć listę modeli.');
    return;
  }
  hideError();

  const label = refreshBrandModelsBtn.textContent;
  refreshBrandModelsBtn.disabled = true;
  refreshBrandModelsBtn.textContent = 'Pobieram modele...';

  try {
    const response = await fetch('/api/catalog/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'osobowe', brand }),
    });
    const data = await response.json();

    if (!data.success) {
      showError(data.error || 'Nie udało się odświeżyć modeli.');
      refreshBrandModelsBtn.textContent = label;
      return;
    }

    const brandData = await (await fetch(`/api/catalog?category=osobowe&brand=${encodeURIComponent(brand)}`)).json();
    if (brandData.success) {
      BRANDS_MODELS[brand] = brandData.brand.models.map((m) => m.name).sort((a, b) => a.localeCompare(b, 'pl'));
      buildModelList(modelSelect.value);
    }

    const date = (data.crawledAt || '').slice(0, 10);
    refreshBrandModelsBtn.textContent = `Odśwież modele marki (${date})`;
    const parts = [`${data.brand}: ${data.models} modeli`];
    if (data.added.length) parts.push(`+${data.added.length} nowe`);
    if (data.removed.length) parts.push(`-${data.removed.length}`);
    brandModelsInfo.textContent = parts.join(', ');
  } catch (err) {
    showError('Nie udało się odświeżyć modeli: ' + err.message);
    refreshBrandModelsBtn.textContent = label;
  } finally {
    refreshBrandModelsBtn.disabled = false;
  }
});
```

- [ ] **Step 4: Check it in the browser**

Run: `npm run dev`
Then open `http://localhost:3001`, pick a brand, click "Odśwież modele marki".
Expected (with a catalog present and proxy env set): the button label gains today's date and the model
dropdown lists that brand's models. Without a catalog the API answers 404 and the error text appears —
that is the pre-crawl state and is fixed by Task 12.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/js/app.js
git commit -m "feat(catalog): add the 'Odśwież modele marki' button to the form"
```

---

## Task 12: Deploy and verify on the server

**Files:** none changed — this task runs the deploy.

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Deploy**

Run: `node scripts/deploy.js`
Expected: git pull, `npm run build`, `pm2 restart car-price-checker`, then `pm2 status` showing the
process online on 209.38.221.144.

- [ ] **Step 3: Add a remote-run helper**

`scripts/deploy.js` connects with ssh2 and a hard-coded root password. Reuse that connection for
one-off commands instead of duplicating it. Create `scripts/run-remote.js`:

```js
/**
 * Run one command on the ileoto server:
 *   node scripts/run-remote.js "cd /opt/car-price-checker && npm run crawl-catalog"
 *
 * Credentials: SSH_PASS env var, falling back to the password in deploy.js.
 */
const { Client } = require('ssh2');

const HOST = '209.38.221.144';
const USER = 'root';
const PASS = process.env.SSH_PASS || 'HasloDo1!Ocean';

const command = process.argv.slice(2).join(' ');
if (!command) {
  console.error('Usage: node scripts/run-remote.js "<command>"');
  process.exit(1);
}

const conn = new Client();
conn
  .on('ready', () => {
    conn.exec(command, (err, stream) => {
      if (err) { console.error(err); process.exit(1); }
      stream
        .on('data', (d) => process.stdout.write(d))
        .stderr.on('data', (d) => process.stderr.write(d));
      stream.on('close', (code) => { conn.end(); process.exit(code || 0); });
    });
  })
  .on('error', (err) => { console.error('SSH error:', err.message); process.exit(1); })
  .connect({ host: HOST, username: USER, password: PASS, readyTimeout: 20000 });
```

Commit it:
```bash
git add scripts/run-remote.js
git commit -m "chore: helper to run one command on the ileoto server"
```

- [ ] **Step 4: Run the first crawl on the server**

The proxy variables live in `/opt/car-price-checker/.env` on the server; check first, and pass them
explicitly if the file is missing:

```bash
node scripts/run-remote.js "cd /opt/car-price-checker && grep -c PROXY_URL .env || true"
node scripts/run-remote.js "cd /opt/car-price-checker && set -a && . ./.env 2>/dev/null; set +a; npx ts-node scripts/crawl-catalog.ts"
```
Expected: the two category lines (≈190/2563 cars, ≈263/3066 motorcycles), no problems, and
`Saved /opt/car-price-checker/data/catalog.json`.
If it reports problems, it exits 1 and writes nothing — read the listed checks, fix, redeploy, re-run.

- [ ] **Step 5: Verify the API**

Run (on the server):
```bash
curl -s localhost:3001/api/catalog | head -c 200
curl -s "localhost:3001/api/catalog?category=osobowe&brand=Volkswagen" | head -c 300
curl -s "localhost:3001/api/catalog?category=motocykle-i-quady&brand=Yamaha" | head -c 300
curl -s localhost:3001/js/brands-models.js | head -c 200
```
Expected: the catalog JSON; Volkswagen with `polo` among its models; Yamaha with `fz6`; and
`brands-models.js` starting with the generated header.

- [ ] **Step 6: Verify the form in a browser**

Open `https://ileoto.pl`, pick Volkswagen → Polo, confirm the generation dropdown still fills, then
click "Odśwież modele marki".
Expected: a date appears in the button label and the model list reloads. A second click within
10 minutes shows the cooldown message.

- [ ] **Step 7: Record the result**

Note in the PR/commit message the final counts from Step 3 and anything that needed a retry.

---

## Self-review notes

- **Spec coverage:** data file (Task 1, 5), extraction (2), four checks (3), per-brand retry (7),
  crawl script (10), API + generated js (8, 9), button (11), tests throughout, deploy and live
  verification (12). The two follow-ups in the spec (rotating proxy credentials, using catalog slugs
  in `url-builder.ts`) are deliberately out of scope.
- **Not covered here:** the samochody backend switching from its bundled `otomoto-models.json` to
  `GET /api/catalog` — that belongs to the third piece (motorcycle price search + backend), planned
  separately.
