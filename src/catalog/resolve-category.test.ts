import { describe, it, expect } from 'vitest';
import { resolveCategory } from './resolve-category';
import { Catalog } from './types';

const brand = (slug: string, models: string[]) => ({
  slug,
  name: slug,
  count: 100,
  crawledAt: '2026-09-16T00:00:00.000Z',
  models: models.map((m) => ({ slug: m, name: m, count: 10, generations: [] })),
});

const catalog = (): Catalog => ({
  version: 1,
  categories: {
    osobowe: {
      crawledAt: '2026-09-16T00:00:00.000Z',
      brands: [
        brand('volkswagen', ['polo', 'golf']),
        brand('honda', ['civic', 'cr-v']),
        brand('bmw', ['seria-3', 'x5']),
      ],
    },
    'motocykle-i-quady': {
      crawledAt: '2026-09-16T00:00:00.000Z',
      brands: [
        brand('yamaha', ['yzf-r7', 'mt-07']),
        brand('honda', ['cbr-600', 'africa-twin']),
        brand('bmw', ['r-1250-gs']),
      ],
    },
  },
});

describe('resolveCategory', () => {
  // The bug this exists for: every motorcycle was searched under /osobowe/, found nothing,
  // and fell through to the AI estimate. Yamaha sells no cars at all.
  it('sends a motorcycle brand to the motorcycle section', () => {
    expect(resolveCategory('YAMAHA', 'YZF-R7', catalog())).toBe('motocykle-i-quady');
  });

  it('leaves ordinary cars exactly where they were', () => {
    expect(resolveCategory('VOLKSWAGEN', 'Polo', catalog())).toBe('osobowe');
  });

  // The interesting half: Honda, BMW and Suzuki sell both, so the brand alone decides nothing.
  it('uses the model to separate a brand that sells both', () => {
    expect(resolveCategory('HONDA', 'CBR 600', catalog())).toBe('motocykle-i-quady');
    expect(resolveCategory('HONDA', 'Civic', catalog())).toBe('osobowe');
  });

  it('matches a model that carries extra words, as Informex writes them', () => {
    expect(resolveCategory('BMW', 'R 1250 GS Adventure', catalog())).toBe('motocykle-i-quady');
    expect(resolveCategory('BMW', 'Seria 3 (G20) 320d', catalog())).toBe('osobowe');
  });

  // Everything unknown must behave exactly as before this function existed.
  it('falls back to cars when nothing matches', () => {
    expect(resolveCategory('DACIA', 'Duster', catalog())).toBe('osobowe');
    expect(resolveCategory('', '', catalog())).toBe('osobowe');
  });

  it('falls back to cars when a brand is in both and the model matches neither', () => {
    expect(resolveCategory('HONDA', 'Jazz', catalog())).toBe('osobowe');
  });

  it('survives a missing or empty catalog', () => {
    expect(resolveCategory('YAMAHA', 'YZF-R7', null)).toBe('osobowe');
    expect(resolveCategory('YAMAHA', 'YZF-R7', { version: 1, categories: {} } as any)).toBe('osobowe');
  });
});
