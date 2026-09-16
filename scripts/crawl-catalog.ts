/**
 * Full Otomoto catalog crawl: brands, models and generations for cars and motorcycles.
 *
 *   npm run crawl-catalog            # crawl, validate, save
 *   npm run crawl-catalog -- --dry   # crawl and report, save nothing
 *
 * Needs PROXY_URL / PROXY_USER / PROXY_PASS in the environment (same as the price scraper).
 */
import { crawlCatalog } from '../src/catalog/crawl';
import { fetchOtomotoPage } from '../src/catalog/fetch-page';
import { loadCatalog, saveCatalog, catalogPath } from '../src/catalog/store';
import { CATEGORY_IDS } from '../src/catalog/types';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry');
  const previous = loadCatalog();

  console.log('=== Otomoto catalog crawl ===');
  console.log(previous ? 'Previous catalog loaded (shrink checks active).' : 'No previous catalog — first crawl.');

  const { catalog, problems } = await crawlCatalog({ fetchPage: fetchOtomotoPage, previous });

  for (const categoryId of CATEGORY_IDS) {
    const category = catalog.categories[categoryId];
    const models = category.brands.reduce((sum, b) => sum + b.models.length, 0);
    const generations = category.brands.reduce(
      (sum, b) => sum + b.models.reduce((s, m) => s + m.generations.length, 0), 0);
    console.log(`${categoryId}: ${category.brands.length} brands, ${models} models, ${generations} generations`);
  }

  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s) — catalog NOT saved:`);
    for (const p of problems.slice(0, 20)) console.error(`  [${p.check}] ${p.message}`);
    if (problems.length > 20) console.error(`  ... and ${problems.length - 20} more`);
    process.exit(1);
  }

  if (dryRun) {
    console.log('\n--dry: nothing written.');
    return;
  }

  saveCatalog(undefined, catalog);
  console.log(`\nSaved ${catalogPath()}`);
}

main().catch((err) => {
  console.error('Crawl failed:', err.message);
  process.exit(1);
});
