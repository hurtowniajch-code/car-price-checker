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
