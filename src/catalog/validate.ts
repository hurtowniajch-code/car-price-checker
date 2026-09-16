import { CatalogCategory, CategoryId } from './types';

export interface Problem {
  check: 'minimum_size' | 'models_present' | 'totals' | 'shrink';
  brand?: string;
  message: string;
}

/** A crawl smaller than this means Otomoto returned a partial page. */
export const MINIMUMS: Record<CategoryId, { brands: number; models: number }> = {
  osobowe: { brands: 150, models: 1500 },
  'motocykle-i-quady': { brands: 150, models: 1500 },
};

const MAX_BRAND_MODEL_LOSS = 0.2;   // a brand may not lose more than 20% of its models
const MAX_CATEGORY_BRAND_LOSS = 0.05; // a category may not lose more than 5% of its brands

/** Listings without a model set: allow the larger of 5 or 0.1% of the brand's listings. */
function totalsTolerance(brandCount: number): number {
  return Math.max(5, Math.round(brandCount * 0.001));
}

/**
 * Pure: every reason this category must not be saved. Empty array = safe to save.
 * `previous` is the catalog currently on disk, or null on a first crawl.
 */
export function validateCategory(
  categoryId: CategoryId,
  category: CatalogCategory,
  previous: CatalogCategory | null,
): Problem[] {
  const problems: Problem[] = [];
  const minimum = MINIMUMS[categoryId];
  const totalModels = category.brands.reduce((sum, b) => sum + b.models.length, 0);

  if (category.brands.length < minimum.brands) {
    problems.push({
      check: 'minimum_size',
      message: `only ${category.brands.length} brands, expected at least ${minimum.brands}`,
    });
  }
  if (totalModels < minimum.models) {
    problems.push({
      check: 'minimum_size',
      message: `only ${totalModels} models, expected at least ${minimum.models}`,
    });
  }

  for (const brand of category.brands) {
    if (brand.count > 0 && brand.models.length === 0) {
      problems.push({ check: 'models_present', brand: brand.slug, message: `${brand.slug} has ${brand.count} listings but no models` });
      continue;
    }
    const sum = brand.models.reduce((s, m) => s + m.count, 0);
    if (Math.abs(brand.count - sum) > totalsTolerance(brand.count)) {
      problems.push({
        check: 'totals',
        brand: brand.slug,
        message: `${brand.slug}: brand count ${brand.count} but models add up to ${sum}`,
      });
    }
  }

  if (previous && previous.brands.length > 0) {
    if (category.brands.length < previous.brands.length * (1 - MAX_CATEGORY_BRAND_LOSS)) {
      problems.push({
        check: 'shrink',
        message: `brands dropped from ${previous.brands.length} to ${category.brands.length}`,
      });
    }
    const before = new Map(previous.brands.map((b) => [b.slug, b.models.length]));
    for (const brand of category.brands) {
      const had = before.get(brand.slug) ?? 0;
      if (had > 0 && brand.models.length < had * (1 - MAX_BRAND_MODEL_LOSS)) {
        problems.push({
          check: 'shrink',
          brand: brand.slug,
          message: `${brand.slug}: models dropped from ${had} to ${brand.models.length}`,
        });
      }
    }
  }

  return problems;
}
