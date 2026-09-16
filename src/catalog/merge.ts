import { Catalog, CatalogBrand, CategoryId } from './types';

export interface MergeResult {
  catalog: Catalog;
  added: string[];
  removed: string[];
}

/** Pure: return a new catalog with this brand replaced (or appended), plus the model diff. */
export function mergeBrand(catalog: Catalog, categoryId: CategoryId, brand: CatalogBrand): MergeResult {
  const category = catalog.categories[categoryId];
  const existing = category.brands.find((b) => b.slug === brand.slug);

  const had = new Set((existing?.models ?? []).map((m) => m.slug));
  const now = new Set(brand.models.map((m) => m.slug));
  const added = [...now].filter((slug) => !had.has(slug));
  const removed = [...had].filter((slug) => !now.has(slug));

  const brands = existing
    ? category.brands.map((b) => (b.slug === brand.slug ? brand : b))
    : [...category.brands, brand];

  return {
    catalog: {
      ...catalog,
      categories: { ...catalog.categories, [categoryId]: { ...category, brands } },
    },
    added,
    removed,
  };
}
