import { describe, it, expect } from 'vitest';
import { resolveModelSlug } from './resolve-model';
import { Catalog } from './types';

const brand = (slug: string, models: Array<[string, number]>) => ({
  slug,
  name: slug,
  count: 1000,
  crawledAt: '2026-09-16T00:00:00.000Z',
  models: models.map(([m, count]) => ({ slug: m, name: m, count, generations: [] })),
});

// Shaped from the real catalog crawled on 16 Sep 2026.
const catalog = (): Catalog => ({
  version: 1,
  categories: {
    osobowe: {
      crawledAt: '2026-09-16T00:00:00.000Z',
      brands: [
        brand('volkswagen', [['golf', 5000], ['polo', 2000]]),
        brand('bmw', [['seria-3', 4000], ['x5', 900]]),
        brand('ford', [['mustang', 300], ['gt', 4]]),
        brand('audi', [['a4', 3000]]),
      ],
    },
    'motocykle-i-quady': {
      crawledAt: '2026-09-16T00:00:00.000Z',
      brands: [
        // Exactly what the live catalog holds for Yamaha: the family and the variant are
        // separate models, and the variant is the smaller, more specific one.
        brand('yamaha', [['yzf', 121], ['r7', 33], ['r1', 80], ['mt-07', 150]]),
        brand('honda', [['cbr', 200], ['africa-twin', 90]]),
        brand('bmw', [['r-1250-gs', 120], ['r', 400]]),
      ],
    },
  },
});

describe('resolveModelSlug', () => {
  // The bug: "YZF-R7" slugified to yzf-r7, which is not a model on Otomoto, so the search
  // page was empty. The real slug is r7 — the variant, not the family.
  it('finds the motorcycle variant rather than the family', () => {
    expect(resolveModelSlug('yamaha', 'YZF-R7', 'motocykle-i-quady', catalog())).toBe('r7');
  });

  it('takes an exact model as it is', () => {
    expect(resolveModelSlug('yamaha', 'MT-07', 'motocykle-i-quady', catalog())).toBe('mt-07');
    expect(resolveModelSlug('volkswagen', 'Golf', 'osobowe', catalog())).toBe('golf');
    expect(resolveModelSlug('honda', 'Africa Twin', 'motocykle-i-quady', catalog())).toBe('africa-twin');
  });

  // Cars are named the other way round - model first, generation or trim after - so the
  // specific part is at the front. "Mustang GT" must not become Ford's GT supercar.
  it('keeps a car on its model, not on a trim that happens to be a model too', () => {
    expect(resolveModelSlug('ford', 'Mustang GT', 'osobowe', catalog())).toBe('mustang');
    expect(resolveModelSlug('bmw', 'Seria 3 (G20) 320d', 'osobowe', catalog())).toBe('seria-3');
    expect(resolveModelSlug('audi', 'A4 B9 Avant', 'osobowe', catalog())).toBe('a4');
  });

  it('prefers the longer, more specific motorcycle model over a one-letter one', () => {
    expect(resolveModelSlug('bmw', 'R 1250 GS Adventure', 'motocykle-i-quady', catalog())).toBe('r-1250-gs');
  });

  // A confident wrong comparison is worse than none: an R1 and an R3 under one median would
  // produce a number nobody can check. Null means "no comps", and the valuation falls back.
  it('gives up rather than guess when nothing matches', () => {
    expect(resolveModelSlug('yamaha', 'Tracer 900', 'motocykle-i-quady', catalog())).toBeNull();
    expect(resolveModelSlug('volkswagen', 'Taigo', 'osobowe', catalog())).toBeNull();
  });

  it('gives up on an unknown brand or a missing catalog', () => {
    expect(resolveModelSlug('zongshen', 'ZS125', 'motocykle-i-quady', catalog())).toBeNull();
    expect(resolveModelSlug('yamaha', 'YZF-R7', 'motocykle-i-quady', null)).toBeNull();
  });
});
