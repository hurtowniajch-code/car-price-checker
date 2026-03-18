import { SearchParams } from '../types';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');
}

// Some models have Otomoto slugs that differ from slugify(modelName)
const MODEL_SLUG_OVERRIDES: Record<string, Record<string, string>> = {
  'mercedes-benz': {
    'gla': 'gla-klasa',
    'glb': 'glb-klasa',
    'glc': 'glc-klasa',
    'gle': 'gle-klasa',
    'gls': 'gls-klasa',
    'gl':  'gl-klasa',
    'glk': 'glk-klasa',
  },
};

export function buildOtomotoUrl(params: SearchParams, page: number = 1): string {
  const brandSlug = slugify(params.brand);
  const rawModelSlug = slugify(params.model);
  const modelSlug = MODEL_SLUG_OVERRIDES[brandSlug]?.[rawModelSlug] ?? rawModelSlug;

  const base = `https://www.otomoto.pl/osobowe/${brandSlug}/${modelSlug}`;

  const query = new URLSearchParams();

  // Year range: ±yearRange from the spec year, clamped to generation range if available
  if (params.year) {
    const range = params.yearRange ?? 1;
    let yearFrom = params.year - range;
    let yearTo = params.year + range;
    if (params.generationYearFrom && yearFrom < params.generationYearFrom) {
      yearFrom = params.generationYearFrom;
    }
    if (params.generationYearTo && yearTo > params.generationYearTo) {
      yearTo = params.generationYearTo;
    }
    // Only apply year filter if the range is valid (generation filter already scopes it)
    if (yearFrom <= yearTo) {
      query.set('search[filter_float_year:from]', String(yearFrom));
      query.set('search[filter_float_year:to]', String(yearTo));
    }
  }

  // Mileage range: ±mileageRange km from input
  if (params.mileage) {
    const mileageRange = (params.mileageRange ?? 25) * 1000;
    const from = Math.max(0, params.mileage - mileageRange);
    const to = params.mileage + mileageRange;
    query.set('search[filter_float_mileage:from]', String(from));
    query.set('search[filter_float_mileage:to]', String(to));
  }

  // Generation filter (e.g. gen-e90-2005-2012)
  if (params.generation) {
    query.set('search[filter_enum_generation]', params.generation);
  }

  // Engine capacity is NOT included in the URL — Otomoto returns anti-bot pages for capacity-filtered URLs.
  // The post-filter in estimate.ts handles engine capacity matching with ±5 cc tolerance.

  // Power — single or multiple values (±2 KM around min/max)
  const pwrs = params.powers?.length ? params.powers
    : params.power ? [params.power] : null;
  if (pwrs && pwrs.length > 0) {
    query.set('search[filter_float_engine_power:from]', String(Math.min(...pwrs) - 2));
    query.set('search[filter_float_engine_power:to]', String(Math.max(...pwrs) + 2));
  }

  // Damaged filter: "undamaged" or "damaged"
  if (params.damaged === 'undamaged') {
    query.set('search[filter_enum_damaged]', '0');
  } else if (params.damaged === 'damaged') {
    query.set('search[filter_enum_damaged]', '1');
  }

  // Sort order (default: price ascending; options fetch uses created_at:desc for variety)
  query.set('search[order]', params.sort ?? 'filter_float_price:asc');
  query.set('search[advanced_search_expanded]', 'true');

  if (page > 1) {
    query.set('page', String(page));
  }

  return `${base}?${query.toString()}`;
}
