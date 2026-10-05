import { Catalog, CategoryId } from './types';

/**
 * Which Otomoto section should we search for this vehicle?
 *
 * Every estimate used to be built against `otomoto.pl/osobowe/…`, hardcoded. A Yamaha
 * YZF-R7 was therefore looked for among passenger cars, found nothing at any step of the
 * search, and the valuation fell through to a guess — for every motorcycle, since September
 * 2026 when the catalog started covering them.
 *
 * The catalog already knows the answer: it is crawled per section, so a brand that sells no
 * cars appears only under `motocykle-i-quady`. Brands that sell both (Honda, BMW, Suzuki,
 * Kawasaki…) are separated by the model.
 *
 * Cars are the default in every uncertain case, so anything this cannot place behaves
 * exactly as it did before.
 */

const DEFAULT_CATEGORY: CategoryId = 'osobowe';

/** Same rules as the URL builder, so what we match here is what we would ask Otomoto for. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');
}

/**
 * Does this model slug name that model?
 *
 * Informex writes a model as a human would — "R 1250 GS Adventure", "Seria 3 (G20) 320d" —
 * so an exact slug match is too strict. A prefix match in either direction is enough to
 * decide which *section* of Otomoto to search, which is a far coarser question than
 * picking the exact model.
 */
function modelMatches(wanted: string, candidate: string): boolean {
  if (!wanted || !candidate) return false;
  return wanted === candidate || wanted.startsWith(candidate) || candidate.startsWith(wanted);
}

export function resolveCategory(
  brand: string,
  model: string,
  catalog: Catalog | null | undefined
): CategoryId {
  if (!catalog?.categories) return DEFAULT_CATEGORY;

  const brandSlug = slugify(brand || '');
  const modelSlug = slugify(model || '');
  if (!brandSlug) return DEFAULT_CATEGORY;

  const byBrand: CategoryId[] = [];
  const byModel: CategoryId[] = [];

  for (const [id, section] of Object.entries(catalog.categories)) {
    const found = section?.brands?.find((b) => b.slug === brandSlug);
    if (!found) continue;
    byBrand.push(id as CategoryId);
    if (found.models?.some((m) => modelMatches(modelSlug, m.slug))) {
      byModel.push(id as CategoryId);
    }
  }

  // The model is the stronger signal: it is what separates a Honda Civic from a Honda CBR.
  if (byModel.length === 1) return byModel[0];
  if (byModel.length > 1) return byModel.includes(DEFAULT_CATEGORY) ? DEFAULT_CATEGORY : byModel[0];

  // No model matched anywhere. A brand that exists in exactly one section still answers it.
  if (byBrand.length === 1) return byBrand[0];

  return DEFAULT_CATEGORY;
}
