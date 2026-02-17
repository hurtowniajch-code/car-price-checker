import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const PAGE_DELAY_MS = 2000;
const PROGRESS_FILE = path.resolve(__dirname, '..', '.scrape-options-progress.json');

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');
}

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
  const proxyUrl = process.env.PROXY_URL;
  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
  ];
  if (proxyUrl) {
    launchArgs.push(`--proxy-server=${proxyUrl}`);
    console.log(`[Browser] Using proxy: ${proxyUrl.replace(/\/\/.*@/, '//*:*@')}`);
  }

  return puppeteer.launch({
    headless: true,
    protocolTimeout: 60000,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: launchArgs,
  });
}

async function setupPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();

  const proxyUser = process.env.PROXY_USER;
  const proxyPass = process.env.PROXY_PASS;
  if (proxyUser && proxyPass) {
    await page.authenticate({ username: proxyUser, password: proxyPass });
  }

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8' });
  return page;
}

interface ModelOptions {
  fuelTypes: string[];
  gearboxes: string[];
  engineCapacities: number[];
  powers: number[];
  engineCapacitiesByFuel: Record<string, number[]>;
  powersByFuel: Record<string, number[]>;
  byGeneration?: Record<string, ModelOptions>;
}

interface GenerationInfo {
  name: string;
  slug: string;
}

/**
 * Phase A: Extract enum filters (fuel_type, gearbox) from __NEXT_DATA__ filters.states.
 * One page visit gives us data for ALL brand/model combos.
 * Returns: Record<brandSlug, Record<modelSlug, { fuelTypes, gearboxes }>>
 */
async function extractEnumFilters(
  page: Page
): Promise<Record<string, Record<string, { fuelTypes: string[]; gearboxes: string[] }>>> {
  console.log('[Phase A] Navigating to extract enum filters from __NEXT_DATA__...');
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

      const enumMap: Record<string, Record<string, { fuelTypes: string[]; gearboxes: string[] }>> = {};

      for (const key of Object.keys(urqlState)) {
        const entry = urqlState[key];
        if (typeof entry?.data !== 'string') continue;

        const parsed = JSON.parse(entry.data);
        if (!parsed?.filters?.states) continue;

        const states = parsed.filters.states;
        if (!Array.isArray(states)) continue;

        for (const state of states) {
          const filterId = state.filterId;
          if (filterId !== 'filter_enum_fuel_type' && filterId !== 'filter_enum_gearbox') continue;

          let brandSlug = '';
          let modelSlug = '';
          if (Array.isArray(state.conditions)) {
            for (const cond of state.conditions) {
              if (cond.filterId === 'filter_enum_make') brandSlug = cond.value;
              if (cond.filterId === 'filter_enum_model') modelSlug = cond.value;
            }
          }

          if (!brandSlug || !modelSlug) continue;

          const values = state.values?.[0]?.values || [];
          if (values.length === 0) continue;

          const names = values
            .filter((v: any) => v.name)
            .map((v: any) => v.name as string);

          if (names.length === 0) continue;

          if (!enumMap[brandSlug]) enumMap[brandSlug] = {};
          if (!enumMap[brandSlug][modelSlug]) {
            enumMap[brandSlug][modelSlug] = { fuelTypes: [], gearboxes: [] };
          }

          if (filterId === 'filter_enum_fuel_type') {
            enumMap[brandSlug][modelSlug].fuelTypes = names;
          } else if (filterId === 'filter_enum_gearbox') {
            enumMap[brandSlug][modelSlug].gearboxes = names;
          }
        }
      }

      return enumMap;
    } catch {
      return null;
    }
  });

  if (!result) {
    console.log('[Phase A] Failed to extract enum filters');
    return {};
  }

  let fuelCount = 0;
  let gearboxCount = 0;
  for (const models of Object.values(result)) {
    for (const data of Object.values(models)) {
      if (data.fuelTypes.length > 0) fuelCount++;
      if (data.gearboxes.length > 0) gearboxCount++;
    }
  }
  console.log(`[Phase A] Extracted fuel types for ${fuelCount} models, gearboxes for ${gearboxCount} models`);

  return result;
}

/**
 * Phase B: Extract engine capacities and powers from listing data on each model page.
 * Must visit each brand/model page individually.
 */
async function extractListingData(
  page: Page,
  brandSlug: string,
  modelSlug: string,
  generationSlug?: string
): Promise<{
  engineCapacities: number[];
  powers: number[];
  fuelTypes: string[];
  gearboxes: string[];
  engineCapacitiesByFuel: Record<string, number[]>;
  powersByFuel: Record<string, number[]>;
} | null> {
  let url = `https://www.otomoto.pl/osobowe/${brandSlug}/${modelSlug}`;
  if (generationSlug) {
    url += `?search[filter_enum_generation]=${encodeURIComponent(generationSlug)}`;
  }

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  } catch {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await delay(3000);
    } catch {
      return null;
    }
  }

  // Detect redirects — if Otomoto doesn't recognise the model slug it redirects
  // to a parent page (e.g. /osobowe/audi) whose listings are not model-specific.
  const finalUrl = page.url();
  if (!finalUrl.includes(`/${brandSlug}/${modelSlug}`)) {
    console.log(`    [redirect] ${finalUrl} — skipping`);
    return null;
  }

  return page.evaluate(() => {
    const scriptEl = document.querySelector('script#__NEXT_DATA__');
    if (!scriptEl?.textContent) return null;

    try {
      const data = JSON.parse(scriptEl.textContent);
      const urqlState = data?.props?.pageProps?.urqlState;
      if (!urqlState) return null;

      for (const key of Object.keys(urqlState)) {
        const entry = urqlState[key];
        if (typeof entry?.data !== 'string' || !entry.data.includes('advertSearch')) continue;

        const parsed = JSON.parse(entry.data);
        const edges = parsed?.advertSearch?.edges;
        if (!Array.isArray(edges) || edges.length === 0) continue;

        const engineCaps = new Set<number>();
        const powerSet = new Set<number>();
        const fuelSet = new Set<string>();
        const gearboxSet = new Set<string>();
        const ecByFuel: Record<string, Set<number>> = {};
        const pwByFuel: Record<string, Set<number>> = {};

        for (const edge of edges) {
          const node = edge.node;
          if (!node) continue;

          const params = node.parameters || [];
          const getParam = (k: string) => params.find((p: any) => p.key === k);

          const fuelParam = getParam('fuel_type');
          const fuel = fuelParam?.displayValue || null;
          if (fuel) fuelSet.add(fuel);

          const gearboxParam = getParam('gearbox');
          const gearbox = gearboxParam?.displayValue || null;
          if (gearbox) gearboxSet.add(gearbox);

          const engineParam = getParam('engine_capacity');
          if (engineParam) {
            const ec = parseInt(String(engineParam.value).replace(/[^\d]/g, ''), 10);
            if (ec > 0) {
              engineCaps.add(ec);
              if (fuel) {
                if (!ecByFuel[fuel]) ecByFuel[fuel] = new Set();
                ecByFuel[fuel].add(ec);
              }
            }
          }

          const powerParam = getParam('engine_power');
          if (powerParam) {
            const pw = parseInt(String(powerParam.value).replace(/[^\d]/g, ''), 10);
            if (pw > 0) {
              powerSet.add(pw);
              if (fuel) {
                if (!pwByFuel[fuel]) pwByFuel[fuel] = new Set();
                pwByFuel[fuel].add(pw);
              }
            }
          }
        }

        const engineCapacitiesByFuel: Record<string, number[]> = {};
        for (const [f, s] of Object.entries(ecByFuel)) {
          engineCapacitiesByFuel[f] = [...s].sort((a, b) => a - b);
        }

        const powersByFuel: Record<string, number[]> = {};
        for (const [f, s] of Object.entries(pwByFuel)) {
          powersByFuel[f] = [...s].sort((a, b) => a - b);
        }

        return {
          engineCapacities: [...engineCaps].sort((a, b) => a - b),
          powers: [...powerSet].sort((a, b) => a - b),
          fuelTypes: [...fuelSet].sort(),
          gearboxes: [...gearboxSet].sort(),
          engineCapacitiesByFuel,
          powersByFuel,
        };
      }

      return null;
    } catch {
      return null;
    }
  });
}

/**
 * Read brands-models.js to get the list of brands and models
 */
function loadBrandsModels(): Record<string, string[]> {
  const filePath = path.resolve(__dirname, '..', 'public', 'js', 'brands-models.js');
  const content = fs.readFileSync(filePath, 'utf8');

  // Extract the BRANDS_MODELS object using regex
  const match = content.match(/const BRANDS_MODELS = \{([\s\S]*?)\n\};/);
  if (!match) throw new Error('Could not parse brands-models.js');

  // Use eval to parse the JS object (safe here since we control the file)
  const fn = new Function(`return {${match[1]}};`);
  return fn();
}

/**
 * Read generations.js to get generation slugs per brand/model
 */
function loadGenerations(): Record<string, Record<string, GenerationInfo[]>> {
  const filePath = path.resolve(__dirname, '..', 'public', 'js', 'generations.js');
  const content = fs.readFileSync(filePath, 'utf8');

  const match = content.match(/const GENERATIONS = \{([\s\S]*?)\n\};/);
  if (!match) throw new Error('Could not parse generations.js');

  const fn = new Function(`return {${match[1]}};`);
  return fn();
}

function formatModelOptions(opts: ModelOptions, indent: string): string {
  const parts: string[] = [];

  if (opts.fuelTypes.length > 0) {
    parts.push(`${indent}  fuelTypes: ${JSON.stringify(opts.fuelTypes)}`);
  }
  if (opts.gearboxes.length > 0) {
    parts.push(`${indent}  gearboxes: ${JSON.stringify(opts.gearboxes)}`);
  }
  if (opts.engineCapacities.length > 0) {
    parts.push(`${indent}  engineCapacities: ${JSON.stringify(opts.engineCapacities)}`);
  }
  if (opts.powers.length > 0) {
    parts.push(`${indent}  powers: ${JSON.stringify(opts.powers)}`);
  }
  if (Object.keys(opts.engineCapacitiesByFuel).length > 0) {
    parts.push(`${indent}  engineCapacitiesByFuel: ${JSON.stringify(opts.engineCapacitiesByFuel)}`);
  }
  if (Object.keys(opts.powersByFuel).length > 0) {
    parts.push(`${indent}  powersByFuel: ${JSON.stringify(opts.powersByFuel)}`);
  }

  if (opts.byGeneration && Object.keys(opts.byGeneration).length > 0) {
    const genEntries = Object.keys(opts.byGeneration).map((genSlug) => {
      const genOpts = opts.byGeneration![genSlug];
      return `${indent}    ${JSON.stringify(genSlug)}: {\n${formatModelOptions(genOpts, indent + '    ')}\n${indent}    }`;
    });
    parts.push(`${indent}  byGeneration: {\n${genEntries.join(',\n')}\n${indent}  }`);
  }

  return parts.join(',\n');
}

function generateModelOptionsFile(options: Record<string, Record<string, ModelOptions>>): string {
  const sortedBrands = Object.keys(options).sort((a, b) => a.localeCompare(b, 'pl'));

  const brandEntries = sortedBrands.map((brand) => {
    const models = options[brand];
    const sortedModels = Object.keys(models).sort((a, b) => a.localeCompare(b, 'pl'));

    const modelEntries = sortedModels.map((model) => {
      const opts = models[model];
      return `    ${JSON.stringify(model)}: {\n${formatModelOptions(opts, '    ')}\n    }`;
    });

    return `  ${JSON.stringify(brand)}: {\n${modelEntries.join(',\n')}\n  }`;
  });

  return `// Pre-scraped filter options per brand/model
// Auto-generated by scripts/scrape-options.ts on ${new Date().toISOString()}
const MODEL_OPTIONS = {
${brandEntries.join(',\n\n')}
};
`;
}

async function main(): Promise<void> {
  console.log('=== Otomoto Model Options Scraper ===\n');

  // Optional: filter by brand via CLI arg (e.g. npx ts-node scripts/scrape-options.ts Audi)
  const brandFilter = process.argv[2] || null;
  if (brandFilter) {
    console.log(`[Filter] Only scraping brand: ${brandFilter}\n`);
  }

  const brandsModels = loadBrandsModels();
  const generations = loadGenerations();
  const allBrands = Object.keys(brandsModels).sort((a, b) => a.localeCompare(b, 'pl'));
  const totalModels = Object.values(brandsModels).reduce((sum, m) => sum + m.length, 0);
  console.log(`Loaded ${allBrands.length} brands, ${totalModels} models\n`);

  // Build flat list of (brand, model) pairs
  const allPairs: { brand: string; model: string }[] = [];
  for (const brand of allBrands) {
    if (brandFilter && brand !== brandFilter) continue;
    for (const model of brandsModels[brand]) {
      allPairs.push({ brand, model });
    }
  }

  if (allPairs.length === 0) {
    console.error(`No models found${brandFilter ? ` for brand "${brandFilter}"` : ''}`);
    process.exit(1);
  }

  // Check for resume
  const progress = loadProgress();
  let modelOptions: Record<string, Record<string, ModelOptions>> = {};
  let enumFilters: Record<string, Record<string, { fuelTypes: string[]; gearboxes: string[] }>> = {};
  let startIndex = 0;

  if (progress && progress.modelOptions) {
    console.log(`[Resume] Found progress file, resuming from model ${progress.nextIndex}/${allPairs.length}...`);
    modelOptions = progress.modelOptions;
    enumFilters = progress.enumFilters || {};
    startIndex = progress.nextIndex || 0;
  }

  let browser = await launchBrowser();
  let page = await setupPage(browser);

  // Phase A: Extract enum filters (fuel type + gearbox) from one page
  if (Object.keys(enumFilters).length === 0) {
    try {
      enumFilters = await extractEnumFilters(page);
    } catch (err: any) {
      console.log(`[Phase A] Error: ${err.message}, restarting browser...`);
      try { await browser.close(); } catch {}
      browser = await launchBrowser();
      page = await setupPage(browser);
      enumFilters = await extractEnumFilters(page);
    }
  } else {
    console.log(`[Phase A] Using cached enum filters from progress file`);
  }

  // Phase B: Visit each model page for engine capacity + power
  console.log(`\n[Phase B] Scraping listing data for ${allPairs.length} models (starting at ${startIndex})...\n`);

  let scraped = 0;
  let skipped = 0;

  for (let i = startIndex; i < allPairs.length; i++) {
    const { brand, model } = allPairs[i];
    const brandSlug = slugify(brand);
    const modelSlug = slugify(model);

    console.log(`[${i + 1}/${allPairs.length}] ${brand} / ${model}...`);

    try {
      const listingData = await extractListingData(page, brandSlug, modelSlug);

      // Get enum data for this model
      const enumData = enumFilters[brandSlug]?.[modelSlug];

      // Merge: prefer listing data, fall back to enum filters
      const fuelTypes = listingData?.fuelTypes?.length
        ? listingData.fuelTypes
        : (enumData?.fuelTypes || []);

      const gearboxes = listingData?.gearboxes?.length
        ? listingData.gearboxes
        : (enumData?.gearboxes || []);

      const engineCapacities = listingData?.engineCapacities || [];
      const powers = listingData?.powers || [];
      const engineCapacitiesByFuel = listingData?.engineCapacitiesByFuel || {};
      const powersByFuel = listingData?.powersByFuel || {};

      // Only store if we have at least some data
      if (fuelTypes.length > 0 || engineCapacities.length > 0 || powers.length > 0 || gearboxes.length > 0) {
        if (!modelOptions[brand]) modelOptions[brand] = {};
        modelOptions[brand][model] = {
          fuelTypes,
          gearboxes,
          engineCapacities,
          powers,
          engineCapacitiesByFuel,
          powersByFuel,
        };
        scraped++;
        console.log(`  → fuel:${fuelTypes.length} gear:${gearboxes.length} ec:${engineCapacities.length} pw:${powers.length}`);

        // Scrape per-generation data if generations exist for this model
        const modelGens = (generations[brand] && generations[brand][model]) || [];
        if (modelGens.length > 0) {
          const byGen: Record<string, ModelOptions> = {};
          for (const gen of modelGens) {
            await delay(PAGE_DELAY_MS + Math.random() * 500);
            try {
              const genData = await extractListingData(page, brandSlug, modelSlug, gen.slug);
              if (genData && (genData.fuelTypes.length > 0 || genData.engineCapacities.length > 0 || genData.powers.length > 0)) {
                byGen[gen.slug] = {
                  fuelTypes: genData.fuelTypes,
                  gearboxes: genData.gearboxes,
                  engineCapacities: genData.engineCapacities,
                  powers: genData.powers,
                  engineCapacitiesByFuel: genData.engineCapacitiesByFuel,
                  powersByFuel: genData.powersByFuel,
                };
              }
            } catch (err: any) {
              console.log(`    [gen ${gen.slug}] ERROR: ${err.message}`);
            }
          }
          if (Object.keys(byGen).length > 0) {
            modelOptions[brand][model].byGeneration = byGen;
            console.log(`  → generations: ${Object.keys(byGen).length}/${modelGens.length}`);
          }
        }
      } else {
        skipped++;
        console.log(`  → No data (skipping)`);
      }
    } catch (err: any) {
      console.log(`  → ERROR: ${err.message} — restarting browser...`);
      try { await browser.close(); } catch {}
      browser = await launchBrowser();
      page = await setupPage(browser);

      // Retry once
      try {
        const listingData = await extractListingData(page, brandSlug, modelSlug);
        const enumData = enumFilters[brandSlug]?.[modelSlug];
        const fuelTypes = listingData?.fuelTypes?.length ? listingData.fuelTypes : (enumData?.fuelTypes || []);
        const gearboxes = listingData?.gearboxes?.length ? listingData.gearboxes : (enumData?.gearboxes || []);

        if (fuelTypes.length > 0 || (listingData?.engineCapacities?.length || 0) > 0) {
          if (!modelOptions[brand]) modelOptions[brand] = {};
          modelOptions[brand][model] = {
            fuelTypes,
            gearboxes,
            engineCapacities: listingData?.engineCapacities || [],
            powers: listingData?.powers || [],
            engineCapacitiesByFuel: listingData?.engineCapacitiesByFuel || {},
            powersByFuel: listingData?.powersByFuel || {},
          };
          scraped++;
          console.log(`  → (retry) OK`);
        } else {
          skipped++;
          console.log(`  → (retry) No data`);
        }
      } catch {
        skipped++;
        console.log(`  → (retry) Still failing, skipping`);
      }
    }

    // Save progress every 10 models
    if ((i + 1) % 10 === 0) {
      saveProgress({ modelOptions, enumFilters, nextIndex: i + 1 });
      console.log(`  [Progress saved at ${i + 1}/${allPairs.length}]`);
    }

    if (i < allPairs.length - 1) {
      await delay(PAGE_DELAY_MS + Math.random() * 1000);
    }
  }

  // Write output
  console.log(`\n[Output] Writing model-options.js...`);
  const outputPath = path.resolve(__dirname, '..', 'public', 'js', 'model-options.js');
  fs.writeFileSync(outputPath, generateModelOptionsFile(modelOptions), 'utf8');

  // Clean up progress file
  try { fs.unlinkSync(PROGRESS_FILE); } catch {}

  await browser.close();

  console.log(`\n=== Done! ===`);
  console.log(`  Models with data: ${scraped}`);
  console.log(`  Models skipped: ${skipped}`);
  console.log(`  Output: ${outputPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
