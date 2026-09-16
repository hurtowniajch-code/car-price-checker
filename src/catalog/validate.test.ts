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

  it('reports a brand that disappears entirely, even when the category-wide loss is small', () => {
    const previous = healthy(200);
    const now = healthy(200);
    const removed = now.brands[0].slug;
    now.brands = now.brands.slice(1); // 200 -> 199 brands = 0.5% loss, under the 5% threshold
    const problems = validateCategory('osobowe', now, previous);
    expect(problems).toContainEqual(
      expect.objectContaining({ check: 'shrink', brand: removed }),
    );
    expect(problems.map((p) => p.check)).not.toContain('minimum_size');
  });

  it('does not flag a brand that is genuinely new (absent from previous)', () => {
    const previous = healthy(200);
    previous.brands = previous.brands.slice(1); // previous is missing b0
    const now = healthy(200); // now has b0
    const problems = validateCategory('osobowe', now, previous);
    expect(problems).toEqual([]);
  });
});
