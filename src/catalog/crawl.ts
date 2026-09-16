import { extractCategory } from './extract';
import { validateCategory, Problem } from './validate';
import { mergeBrand } from './merge';
import { PageFetcher, categoryUrl, brandUrl } from './fetch-page';
import { Catalog, CATEGORY_IDS, CategoryId, emptyCatalog } from './types';

export interface CrawlOptions {
  fetchPage: PageFetcher;
  /** ISO timestamp factory — injected so tests are deterministic. */
  now?: () => string;
  /** Catalog currently on disk, used by the shrink check. */
  previous: Catalog | null;
}

export interface CrawlResult {
  catalog: Catalog;
  problems: Problem[];
}

/** Read one brand from its own page — the fallback when the category page came back thin. */
export async function refreshBrand(
  fetchPage: PageFetcher,
  categoryId: CategoryId,
  brandSlug: string,
  crawledAt: string,
) {
  const html = await fetchPage(brandUrl(categoryId, brandSlug));
  const category = extractCategory(html, crawledAt);
  const brand = category.brands.find((b) => b.slug === brandSlug);
  if (!brand) throw new Error(`brand ${brandSlug} not found on its own page`);
  return brand;
}

/**
 * Crawl both categories. Brands that fail a check are re-read from their own page once;
 * whatever still fails is reported. Throws only when a category page can't be read at all.
 */
export async function crawlCatalog(options: CrawlOptions): Promise<CrawlResult> {
  const now = options.now ?? (() => new Date().toISOString());
  let catalog = emptyCatalog();
  const problems: Problem[] = [];

  for (const categoryId of CATEGORY_IDS) {
    const crawledAt = now();
    let html: string;
    try {
      html = await options.fetchPage(categoryUrl(categoryId));
    } catch (err) {
      throw new Error(`category ${categoryId}: ${(err as Error).message}`);
    }

    catalog.categories[categoryId] = extractCategory(html, crawledAt);
    const previousCategory = options.previous?.categories[categoryId] ?? null;
    let found = validateCategory(categoryId, catalog.categories[categoryId], previousCategory);

    // Retry each failing brand from its own page.
    const failingBrands = [...new Set(found.filter((p) => p.brand).map((p) => p.brand!))];
    for (const brandSlug of failingBrands) {
      try {
        const brand = await refreshBrand(options.fetchPage, categoryId, brandSlug, crawledAt);
        catalog = mergeBrand(catalog, categoryId, brand).catalog;
      } catch (err) {
        console.warn(`[catalog] retry for ${categoryId}/${brandSlug} failed: ${(err as Error).message}`);
      }
    }

    if (failingBrands.length > 0) {
      found = validateCategory(categoryId, catalog.categories[categoryId], previousCategory);
    }
    problems.push(...found);
  }

  return { catalog, problems };
}
