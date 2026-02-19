import { SearchParams } from '../types';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');
}

export function buildOtomotoUrl(params: SearchParams, page: number = 1): string {
  const brandSlug = slugify(params.brand);
  const modelSlug = slugify(params.model);

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

  // Engine capacity (exact match)
  if (params.engineCapacity) {
    query.set('search[filter_float_engine_capacity:from]', String(params.engineCapacity));
    query.set('search[filter_float_engine_capacity:to]', String(params.engineCapacity));
  }

  // Power (±2 KM range)
  if (params.power) {
    query.set('search[filter_float_engine_power:from]', String(params.power - 2));
    query.set('search[filter_float_engine_power:to]', String(params.power + 2));
  }

  // Damaged filter: "undamaged" or "damaged"
  if (params.damaged === 'undamaged') {
    query.set('search[filter_enum_damaged]', '0');
  } else if (params.damaged === 'damaged') {
    query.set('search[filter_enum_damaged]', '1');
  }

  // Sort by price ascending
  query.set('search[order]', 'filter_float_price:asc');
  query.set('search[advanced_search_expanded]', 'true');

  if (page > 1) {
    query.set('page', String(page));
  }

  return `${base}?${query.toString()}`;
}
