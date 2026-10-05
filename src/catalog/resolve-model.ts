import { Catalog, CategoryId } from './types';

/**
 * Turn a model as Informex writes it into the model slug Otomoto actually lists.
 *
 * Slugifying the name is not enough. "YZF-R7" becomes `yzf-r7`, which is not a model on
 * Otomoto at all — the catalog holds `yzf` (the family, 121 listings) and `r7` (the bike,
 * 33). The search page for `yzf-r7` is empty, so the valuation found no comparables and
 * fell back to a guess even after the section was fixed.
 *
 * The two sections name things in opposite orders, which is the whole difficulty:
 *
 *   motorcycles   FAMILY-VARIANT   YZF-R7, CBR 600, R 1250 GS   -> the variant is at the end
 *   cars          MODEL-TRIM       Mustang GT, Seria 3 G20      -> the model is at the front
 *
 * So the end of the name is the specific part for a motorcycle and the start of it is for a
 * car. Reading them the same way turns a Ford Mustang GT into a Ford GT — four listings of
 * a supercar, as a comparison for a Mustang.
 *
 * When nothing matches, this returns null and the caller does not search at all. That is
 * deliberate: lumping an R1, an R6 and an R3 together under `yzf` would produce a median
 * nobody could check, and a confident wrong number is worse than no number.
 */

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');
}

type Candidate = { slug: string; count: number };

/** Longest first, so the most specific match wins over `r` or `gt`. */
function bySpecificity(a: Candidate, b: Candidate): number {
  return b.slug.length - a.slug.length;
}

export function resolveModelSlug(
  brand: string,
  model: string,
  category: CategoryId,
  catalog: Catalog | null | undefined
): string | null {
  const brandSlug = slugify(brand || '');
  const wanted = slugify(model || '');
  if (!brandSlug || !wanted) return null;

  const found = catalog?.categories?.[category]?.brands?.find((b) => b.slug === brandSlug);
  const models: Candidate[] = (found?.models ?? []).map((m) => ({ slug: m.slug, count: m.count }));
  if (models.length === 0) return null;

  const exact = models.find((m) => m.slug === wanted);
  if (exact) return exact.slug;

  // Whole-token matches only: `r7` may match "yzf-r7", but `r` must not match "r7".
  const atEnd = models.filter((m) => wanted.endsWith(`-${m.slug}`)).sort(bySpecificity);
  const atStart = models.filter((m) => wanted.startsWith(`${m.slug}-`)).sort(bySpecificity);

  const preferred = category === 'motocykle-i-quady' ? [atEnd, atStart] : [atStart, atEnd];
  for (const group of preferred) {
    if (group.length > 0) return group[0].slug;
  }

  return null;
}
