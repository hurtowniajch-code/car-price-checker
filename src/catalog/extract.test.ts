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
