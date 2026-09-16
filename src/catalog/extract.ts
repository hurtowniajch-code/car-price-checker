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
