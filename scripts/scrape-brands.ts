import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const PAGE_DELAY_MS = 2000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');
}

/** Strip trailing count like " (1234)" from option text */
function stripCount(text: string): string {
  return text.replace(/\s*\(\d+\)\s*$/, '').trim();
}

const PROGRESS_FILE = path.resolve(__dirname, '..', '.scrape-progress.json');

function saveProgress(data: any): void {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function loadProgress(): any | null {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch {}
  return null;
}

async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    protocolTimeout: 60000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
}

async function setupPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8' });
  return page;
}

async function dismissCookies(page: Page): Promise<void> {
  try {
    await page.click('#onetrust-accept-btn-handler');
    await delay(500);
  } catch {
    // No consent banner
  }
}

/** Click a dropdown and extract [role="option"] text values */
async function clickDropdownAndExtract(page: Page, placeholderText: string): Promise<string[]> {
  const selector = `input[placeholder*="${placeholderText}"]`;

  try {
    await page.waitForSelector(selector, { timeout: 5000 });
    await page.click(selector);
  } catch {
    return [];
  }

  await delay(2000);

  const options = await page.evaluate(() => {
    const results: string[] = [];
    document.querySelectorAll('[role="option"]').forEach((el) => {
      const text = el.textContent?.trim();
      if (text) results.push(text);
    });
    return results;
  });

  return options.filter((t) =>
    t !== 'Wszystkie' && !t.includes('Wybierz') && t !== ''
  );
}

/**
 * Extract all brands from the main page dropdown.
 */
async function extractBrands(page: Page): Promise<string[]> {
  await page.goto('https://www.otomoto.pl/osobowe', { waitUntil: 'networkidle2', timeout: 30000 });
  await dismissCookies(page);
  await delay(1000);

  const rawBrands = await clickDropdownAndExtract(page, 'Marka');

  if (rawBrands.length === 0) {
    throw new Error('Could not find brands dropdown');
  }

  const brands = [...new Set(rawBrands.map(stripCount))].filter(Boolean);
  console.log(`[Brands] Found ${brands.length} brands`);
  return brands;
}

/**
 * Extract models for a brand by navigating to its page and clicking the model dropdown.
 */
async function extractModelsForBrand(page: Page, brand: string): Promise<string[]> {
  const brandSlug = slugify(brand);
  const url = `https://www.otomoto.pl/osobowe/${brandSlug}`;

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  } catch {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await delay(3000);
    } catch {
      console.log(`  Failed to load page for ${brand}`);
      return [];
    }
  }

  const rawModels = await clickDropdownAndExtract(page, 'Model');

  const models = [...new Set(
    rawModels
      .map(stripCount)
      .filter((m) => m && m !== 'Inny')
  )].sort((a, b) => a.localeCompare(b, 'pl'));

  return models;
}

interface GenerationInfo {
  name: string;
  slug: string;
}

/**
 * Extract ALL generations from __NEXT_DATA__ filters.states on any model page.
 * The filters contain generation data for ALL brand/model combos, not just the current one.
 * Returns: Record<brandSlug, Record<modelSlug, GenerationInfo[]>>
 */
async function extractAllGenerations(
  page: Page
): Promise<Record<string, Record<string, GenerationInfo[]>>> {
  // Navigate to a popular model page to get the full filters data
  console.log('[Generations] Navigating to a model page to extract filters...');
  await page.goto('https://www.otomoto.pl/osobowe/volkswagen/golf', {
    waitUntil: 'networkidle2',
    timeout: 30000,
  });

  const result = await page.evaluate(() => {
    const scriptEl = document.querySelector('script#__NEXT_DATA__');
    if (!scriptEl?.textContent) return null;

    try {
      const data = JSON.parse(scriptEl.textContent);
      const urqlState = data?.props?.pageProps?.urqlState;
      if (!urqlState) return null;

      // Generation data is in filters.states entries with filterId === "filter_enum_generation"
      const genMap: Record<string, Record<string, { name: string; slug: string }[]>> = {};

      for (const key of Object.keys(urqlState)) {
        const entry = urqlState[key];
        if (typeof entry?.data !== 'string') continue;

        const parsed = JSON.parse(entry.data);
        if (!parsed?.filters?.states) continue;

        const states = parsed.filters.states;
        if (!Array.isArray(states)) continue;

        for (const state of states) {
          if (state.filterId !== 'filter_enum_generation') continue;

          // Extract brand and model from conditions
          let brandSlug = '';
          let modelSlug = '';
          if (Array.isArray(state.conditions)) {
            for (const cond of state.conditions) {
              if (cond.filterId === 'filter_enum_make') brandSlug = cond.value;
              if (cond.filterId === 'filter_enum_model') modelSlug = cond.value;
            }
          }

          if (!brandSlug || !modelSlug) continue;

          // Extract generation values
          const values = state.values?.[0]?.values || [];
          if (values.length === 0) continue;

          const gens = values
            .filter((v: any) => v.id && v.name)
            .map((v: any) => ({
              name: v.name,
              slug: v.id,
            }));

          if (gens.length > 0) {
            if (!genMap[brandSlug]) genMap[brandSlug] = {};
            genMap[brandSlug][modelSlug] = gens;
          }
        }
      }

      return genMap;
    } catch {
      return null;
    }
  });

  return result || {};
}

/**
 * Build a reverse mapping from brand slug -> display name using the brands list.
 */
function buildSlugToBrandName(brands: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const brand of brands) {
    map[slugify(brand)] = brand;
  }
  return map;
}

/**
 * Build a reverse mapping from model slug -> display name using the brands/models data.
 */
function buildSlugToModelName(brandsModels: Record<string, string[]>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const models of Object.values(brandsModels)) {
    for (const model of models) {
      map[slugify(model)] = model;
    }
  }
  return map;
}

function generateBrandsModelsFile(brandsModels: Record<string, string[]>): string {
  const sortedBrands = Object.keys(brandsModels).sort((a, b) => a.localeCompare(b, 'pl'));

  const entries = sortedBrands.map((brand) => {
    const models = brandsModels[brand];
    const modelsStr = models.map((m) => JSON.stringify(m)).join(', ');
    return `  ${JSON.stringify(brand)}: [${modelsStr}]`;
  });

  return `// Brand → Models mapping (using otomoto.pl Polish names for URL compatibility)
// Auto-generated by scripts/scrape-brands.ts on ${new Date().toISOString()}
const BRANDS_MODELS = {
${entries.join(',\n')}
};

// Build reverse mapping: model → brand (for auto-fill when model selected without brand)
const MODEL_TO_BRAND = {};
for (const [brand, models] of Object.entries(BRANDS_MODELS)) {
  for (const model of models) {
    const key = model.toLowerCase();
    if (!MODEL_TO_BRAND[key]) {
      MODEL_TO_BRAND[key] = brand;
    }
  }
}

// Get sorted list of all brands
const ALL_BRANDS = Object.keys(BRANDS_MODELS).sort((a, b) => a.localeCompare(b, 'pl'));

// Get flat list of all models with their brands
const ALL_MODELS = [];
for (const [brand, models] of Object.entries(BRANDS_MODELS)) {
  for (const model of models) {
    ALL_MODELS.push({ brand, model });
  }
}
ALL_MODELS.sort((a, b) => a.model.localeCompare(b.model, 'pl'));
`;
}

function generateGenerationsFile(
  gensBySlug: Record<string, Record<string, GenerationInfo[]>>,
  slugToBrand: Record<string, string>,
  slugToModel: Record<string, string>
): string {
  // Convert slug-keyed data to display-name-keyed data
  const generations: Record<string, Record<string, GenerationInfo[]>> = {};

  for (const [brandSlug, models] of Object.entries(gensBySlug)) {
    const brandName = slugToBrand[brandSlug] || brandSlug;
    for (const [modelSlug, gens] of Object.entries(models)) {
      const modelName = slugToModel[modelSlug] || modelSlug;
      if (!generations[brandName]) generations[brandName] = {};
      generations[brandName][modelName] = gens;
    }
  }

  const sortedBrands = Object.keys(generations).sort((a, b) => a.localeCompare(b, 'pl'));

  const brandEntries = sortedBrands.map((brand) => {
    const models = generations[brand];
    const sortedModels = Object.keys(models).sort((a, b) => a.localeCompare(b, 'pl'));

    const modelEntries = sortedModels.map((model) => {
      const gens = models[model];
      const genStrs = gens.map(
        (g) => `      { name: ${JSON.stringify(g.name)}, slug: ${JSON.stringify(g.slug)} }`
      );
      return `    ${JSON.stringify(model)}: [\n${genStrs.join(',\n')}\n    ]`;
    });

    return `  ${JSON.stringify(brand)}: {\n${modelEntries.join(',\n')}\n  }`;
  });

  return `// Generation data: brand → model → [{name, slug}]
// Slugs are otomoto.pl filter_enum_generation values
// Auto-generated by scripts/scrape-brands.ts on ${new Date().toISOString()}
const GENERATIONS = {
${brandEntries.join(',\n\n')}
};
`;
}

async function main(): Promise<void> {
  console.log('=== Otomoto Brand, Model & Generation Scraper ===\n');

  const progress = loadProgress();
  let browser = await launchBrowser();
  let page = await setupPage(browser);
  let brandsModels: Record<string, string[]> = {};
  let brands: string[] = [];
  let startIndex = 0;

  // Resume from progress if available
  if (progress && progress.brandsModels && progress.brands) {
    console.log(`[Resume] Found progress file, resuming from brand ${progress.nextIndex + 1}/${progress.brands.length}...`);
    brandsModels = progress.brandsModels;
    brands = progress.brands;
    startIndex = progress.nextIndex || 0;
    console.log(`  Already scraped: ${Object.keys(brandsModels).length} brands\n`);
  } else {
    // Step 1: Get all brands
    console.log('[Step 1] Extracting brands from otomoto.pl...');
    brands = await extractBrands(page);

    if (brands.length === 0) {
      throw new Error('No brands found.');
    }
  }

  // Step 2: Get models for each brand (with crash recovery)
  console.log(`\n[Step 2] Extracting models for ${brands.length} brands (starting at ${startIndex + 1})...\n`);

  let failures = 0;

  for (let i = startIndex; i < brands.length; i++) {
    const brand = brands[i];
    console.log(`[${i + 1}/${brands.length}] ${brand}...`);

    try {
      const models = await extractModelsForBrand(page, brand);
      if (models.length > 0) {
        brandsModels[brand] = models;
        console.log(`  → ${models.length} models`);
      } else {
        console.log(`  → No models found (skipping)`);
        failures++;
      }
    } catch (err: any) {
      console.log(`  → ERROR: ${err.message} — restarting browser...`);
      try { await browser.close(); } catch {}
      browser = await launchBrowser();
      page = await setupPage(browser);
      // Retry this brand once
      try {
        const models = await extractModelsForBrand(page, brand);
        if (models.length > 0) {
          brandsModels[brand] = models;
          console.log(`  → (retry) ${models.length} models`);
        } else {
          console.log(`  → (retry) No models found (skipping)`);
          failures++;
        }
      } catch {
        console.log(`  → (retry) Still failing, skipping ${brand}`);
        failures++;
      }
    }

    // Save progress every 10 brands
    if ((i + 1) % 10 === 0) {
      saveProgress({ brands, brandsModels, nextIndex: i + 1 });
      console.log(`  [Progress saved at ${i + 1}/${brands.length}]`);
    }

    if (i < brands.length - 1) {
      await delay(PAGE_DELAY_MS + Math.random() * 1000);
    }
  }

  // Step 3: Write brands-models output
  console.log(`\n[Step 3] Writing brands-models.js...`);
  const brandsOutputPath = path.resolve(__dirname, '..', 'public', 'js', 'brands-models.js');
  fs.writeFileSync(brandsOutputPath, generateBrandsModelsFile(brandsModels), 'utf8');

  const totalModels = Object.values(brandsModels).reduce((sum, m) => sum + m.length, 0);
  console.log(`  Brands: ${Object.keys(brandsModels).length}, Models: ${totalModels}`);
  if (failures > 0) console.log(`  Brands with no models (skipped): ${failures}`);

  // Step 4: Extract ALL generations from __NEXT_DATA__ (single page visit!)
  console.log(`\n[Step 4] Extracting all generations from __NEXT_DATA__...`);
  try {
    const gensBySlug = await extractAllGenerations(page);

    const slugToBrand = buildSlugToBrandName(brands);
    const slugToModel = buildSlugToModelName(brandsModels);

    let genBrands = 0;
    let genModels = 0;
    let genTotal = 0;
    for (const models of Object.values(gensBySlug)) {
      genBrands++;
      for (const gens of Object.values(models)) {
        genModels++;
        genTotal += gens.length;
      }
    }
    console.log(`  Brands with generations: ${genBrands}`);
    console.log(`  Models with generations: ${genModels}`);
    console.log(`  Total generations: ${genTotal}`);

    // Step 5: Write generations output
    console.log(`\n[Step 5] Writing generations.js...`);
    const gensOutputPath = path.resolve(__dirname, '..', 'public', 'js', 'generations.js');
    fs.writeFileSync(
      gensOutputPath,
      generateGenerationsFile(gensBySlug, slugToBrand, slugToModel),
      'utf8'
    );
    console.log(`Output: ${gensOutputPath}`);
  } catch (err: any) {
    console.log(`  Generation extraction failed: ${err.message}`);
    console.log(`  Restarting browser and retrying...`);
    try { await browser.close(); } catch {}
    browser = await launchBrowser();
    page = await setupPage(browser);

    const gensBySlug = await extractAllGenerations(page);
    const slugToBrand = buildSlugToBrandName(brands);
    const slugToModel = buildSlugToModelName(brandsModels);

    const gensOutputPath = path.resolve(__dirname, '..', 'public', 'js', 'generations.js');
    fs.writeFileSync(
      gensOutputPath,
      generateGenerationsFile(gensBySlug, slugToBrand, slugToModel),
      'utf8'
    );
  }

  // Clean up progress file
  try { fs.unlinkSync(PROGRESS_FILE); } catch {}

  await browser.close();

  console.log(`\n=== Done! ===`);
  console.log(`Output: ${brandsOutputPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
