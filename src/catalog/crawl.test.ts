import { describe, it, expect } from 'vitest';
import { crawlCatalog, MAX_BRAND_RETRIES } from './crawl';
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

  it('gives a retried brand a fresh timestamp instead of the category page timestamp', async () => {
    const brokenStates = bigStates(CAR_STATES, 'car').filter(
      (s) => !(s.filterId === 'filter_enum_model' && s.conditions?.[0]?.value === 'volkswagen'),
    );
    const brandStates = [
      { filterId: 'filter_enum_make', conditions: [], values: [{ values: [{ id: 'volkswagen', name: 'Volkswagen', counter: 300 }] }] },
      ...CAR_STATES.filter((s) => s.conditions?.[0]?.value === 'volkswagen'),
    ];
    const { fetchPage } = fetcherFor({
      ...HEALTHY_PAGES,
      'https://www.otomoto.pl/osobowe': pageHtml(brokenStates),
      'https://www.otomoto.pl/osobowe/volkswagen': pageHtml(brandStates),
    });

    let i = 0;
    const timestamps = ['2026-09-16T10:00:00.000Z', '2026-09-16T10:05:00.000Z', '2026-09-16T10:10:00.000Z'];
    const now = () => timestamps[Math.min(i++, timestamps.length - 1)];

    const result = await crawlCatalog({ fetchPage, now, previous: null });

    const vw = result.catalog.categories.osobowe.brands.find((b) => b.slug === 'volkswagen')!;
    expect(result.catalog.categories.osobowe.crawledAt).toBe(timestamps[0]);
    expect(vw.crawledAt).toBe(timestamps[1]);
    expect(vw.crawledAt).not.toBe(result.catalog.categories.osobowe.crawledAt);
  });

  it('caps brand retries per category at MAX_BRAND_RETRIES', async () => {
    // Strip model states for the first 30 filler brands, so 30 brands fail
    // "models_present" — more than the retry cap.
    const manyFailing = bigStates(CAR_STATES, 'car').filter((s) => {
      if (s.filterId !== 'filter_enum_model') return true;
      const value = s.conditions?.[0]?.value ?? '';
      const match = /^car(\d+)$/.exec(value);
      return !(match && Number(match[1]) < 30);
    });
    const { fetchPage, calls } = fetcherFor({
      ...HEALTHY_PAGES,
      'https://www.otomoto.pl/osobowe': pageHtml(manyFailing),
    });

    await crawlCatalog({ fetchPage, now: () => AT, previous: null });

    const brandRetryFetches = calls.filter((url) => url.startsWith('https://www.otomoto.pl/osobowe/car'));
    expect(brandRetryFetches.length).toBe(MAX_BRAND_RETRIES);
  });
});
