/** Otomoto sections we build a catalog for. */
export const CATEGORY_IDS = ['osobowe', 'motocykle-i-quady'] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export function isCategoryId(value: string): value is CategoryId {
  return (CATEGORY_IDS as readonly string[]).includes(value);
}

export interface Generation {
  /** Otomoto filter_enum_generation value, e.g. "gen-v-2009-2017" */
  slug: string;
  name: string;
}

export interface CatalogModel {
  /** Otomoto model slug, e.g. "polo" */
  slug: string;
  name: string;
  /** listings Otomoto reports for this model */
  count: number;
  generations: Generation[];
}

export interface CatalogBrand {
  /** Otomoto make slug, e.g. "volkswagen" */
  slug: string;
  name: string;
  count: number;
  /** ISO timestamp of the page this brand came from */
  crawledAt: string;
  models: CatalogModel[];
}

export interface CatalogCategory {
  crawledAt: string;
  brands: CatalogBrand[];
}

export interface Catalog {
  version: 1;
  categories: Record<CategoryId, CatalogCategory>;
}

export function emptyCatalog(): Catalog {
  return {
    version: 1,
    categories: {
      osobowe: { crawledAt: '', brands: [] },
      'motocykle-i-quady': { crawledAt: '', brands: [] },
    },
  };
}
