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
