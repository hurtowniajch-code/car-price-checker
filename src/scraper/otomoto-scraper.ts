import puppeteer, { Browser, Page } from 'puppeteer';
import { SearchParams, ListingData } from '../types';
import { buildOtomotoUrl } from './url-builder';

const MAX_PAGES = 5;
const PAGE_SIZE = 32; // otomoto shows 32 listings per page
const PAGE_DELAY_MS = 2000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrapeOtomoto(params: SearchParams, maxPages: number = MAX_PAGES): Promise<{ listings: ListingData[]; searchUrl: string }> {
  const searchUrl = buildOtomotoUrl(params, 1);
  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8' });

    const allListings: ListingData[] = [];
    const seenLinks = new Set<string>();

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const url = buildOtomotoUrl(params, pageNum);
      console.log(`[Scraper] Page ${pageNum}: ${url}`);

      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      } catch {
        console.log(`[Scraper] Navigation timeout on page ${pageNum}, trying with domcontentloaded`);
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await delay(3000);
        } catch {
          console.log(`[Scraper] Failed to load page ${pageNum}, stopping`);
          break;
        }
      }

      // Dismiss cookie consent if present (first page only)
      if (pageNum === 1) {
        try {
          await page.click('#onetrust-accept-btn-handler');
          await delay(500);
        } catch {
          // No consent banner or already dismissed
        }
      }

      // Try extracting from __NEXT_DATA__ urqlState first (most reliable)
      const { listings, totalCount } = await extractFromUrqlState(page);

      // Fallback to DOM extraction
      let finalListings = listings;
      if (finalListings.length === 0) {
        console.log(`[Scraper] urqlState extraction failed, trying DOM fallback`);
        finalListings = await extractFromDOM(page);
      }

      if (finalListings.length === 0) {
        console.log(`[Scraper] No listings found on page ${pageNum}, stopping`);
        break;
      }

      // Deduplicate by link
      for (const listing of finalListings) {
        if (!seenLinks.has(listing.link)) {
          seenLinks.add(listing.link);
          allListings.push(listing);
        }
      }

      console.log(`[Scraper] Page ${pageNum}: found ${finalListings.length} listings (total: ${allListings.length}, totalCount: ${totalCount})`);

      // Check if there are more pages using totalCount from urqlState
      const totalPages = totalCount > 0 ? Math.ceil(totalCount / PAGE_SIZE) : 1;
      if (pageNum >= totalPages) {
        console.log(`[Scraper] Reached last page (${pageNum}/${totalPages}), stopping`);
        break;
      }

      // Polite delay between pages
      await delay(PAGE_DELAY_MS + Math.random() * 1000);
    }

    await page.close();
    return { listings: allListings, searchUrl };

  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Primary extraction: parse __NEXT_DATA__ → urqlState → advertSearch.edges[].node
 * Otomoto uses urql (GraphQL client), data is stored as stringified JSON in urqlState.
 */
async function extractFromUrqlState(page: Page): Promise<{ listings: ListingData[]; totalCount: number }> {
  return page.evaluate(() => {
    const scriptEl = document.querySelector('script#__NEXT_DATA__');
    if (!scriptEl?.textContent) return { listings: [], totalCount: 0 };

    try {
      const data = JSON.parse(scriptEl.textContent);
      const urqlState = data?.props?.pageProps?.urqlState;
      if (!urqlState) return { listings: [], totalCount: 0 };

      // Find the urqlState entry containing advertSearch
      for (const key of Object.keys(urqlState)) {
        const entry = urqlState[key];
        if (typeof entry?.data !== 'string' || !entry.data.includes('advertSearch')) continue;

        const parsed = JSON.parse(entry.data);
        const edges = parsed?.advertSearch?.edges;
        if (!Array.isArray(edges) || edges.length === 0) continue;

        const totalCount = parsed?.advertSearch?.totalCount || 0;

        const listings = edges.map((edge: any) => {
          const node = edge.node;
          if (!node) return null;

          const params = node.parameters || [];
          const getParam = (key: string) => params.find((p: any) => p.key === key);

          // Price
          let price = 0;
          if (node.price?.amount?.units) {
            price = node.price.amount.units;
          } else if (node.price?.amount) {
            price = typeof node.price.amount === 'number'
              ? node.price.amount
              : parseInt(String(node.price.amount).replace(/[^\d]/g, ''), 10);
          }
          // Fallback: try price parameter
          if (!price) {
            const priceParam = getParam('price');
            if (priceParam) price = parseInt(String(priceParam.value).replace(/[^\d]/g, ''), 10) || 0;
          }

          // Year
          let year: number | null = null;
          const yearParam = getParam('year');
          if (yearParam) year = parseInt(yearParam.value, 10);

          // Mileage
          let mileage: number | null = null;
          const mileParam = getParam('mileage');
          if (mileParam) mileage = parseInt(String(mileParam.value).replace(/[^\d]/g, ''), 10);

          // Fuel type
          const fuelParam = getParam('fuel_type');
          const fuelType = fuelParam?.displayValue || null;

          // Engine capacity
          const engineParam = getParam('engine_capacity');
          const engineCapacity = engineParam ? parseInt(String(engineParam.value).replace(/[^\d]/g, ''), 10) || null : null;

          // Power (engine_power)
          const powerParam = getParam('engine_power');
          const power = powerParam ? parseInt(String(powerParam.value).replace(/[^\d]/g, ''), 10) || null : null;

          // Transmission / gearbox
          const gearboxParam = getParam('gearbox');
          const transmission = gearboxParam?.displayValue || null;

          // Location
          let location: string | null = null;
          if (node.location?.city?.name) {
            location = node.location.city.name;
          } else if (node.location?.region?.name) {
            location = node.location.region.name;
          }

          // Currency
          const currency = node.price?.currency || 'PLN';

          return {
            title: node.title || '',
            price,
            currency,
            year,
            mileage,
            fuelType,
            engineCapacity,
            power,
            transmission,
            location,
            link: node.url || '',
          };
        }).filter((l: any): l is ListingData => l && l.title && l.price > 0);

        return { listings, totalCount };
      }

      return { listings: [], totalCount: 0 };
    } catch {
      return { listings: [], totalCount: 0 };
    }
  });
}

/**
 * Fallback: extract from DOM using article[data-id] elements.
 * Otomoto uses <dl>/<dt>/<dd data-parameter="..."> for params.
 */
async function extractFromDOM(page: Page): Promise<ListingData[]> {
  return page.evaluate(() => {
    const articles = document.querySelectorAll('article[data-id]');
    const results: any[] = [];

    articles.forEach((article) => {
      try {
        // Title
        const titleEl = article.querySelector('h2 a');
        const title = titleEl?.textContent?.trim() || '';

        // Link
        let link = (titleEl as HTMLAnchorElement)?.href || '';
        if (link) {
          // Remove tracking params
          link = link.split('?')[0];
        }

        // Price: look for the price element (h3 or span with currency)
        const priceEl = article.querySelector('h3');
        const priceText = priceEl?.textContent?.trim() || '0';
        const price = parseInt(priceText.replace(/[^\d]/g, ''), 10) || 0;

        // Parameters via data-parameter attributes
        const mileageEl = article.querySelector('dd[data-parameter="mileage"]');
        const fuelEl = article.querySelector('dd[data-parameter="fuel_type"]');
        const yearEl = article.querySelector('dd[data-parameter="year"]');
        const engineEl = article.querySelector('dd[data-parameter="engine_capacity"]');

        const mileageText = mileageEl?.textContent?.trim() || '';
        const mileage = mileageText ? parseInt(mileageText.replace(/[^\d]/g, ''), 10) || null : null;

        const fuelType = fuelEl?.textContent?.trim() || null;

        const yearText = yearEl?.textContent?.trim() || '';
        const year = yearText ? parseInt(yearText.replace(/[^\d]/g, ''), 10) || null : null;

        const engineText = engineEl?.textContent?.trim() || '';
        const engineCapacity = engineText ? parseInt(engineText.replace(/[^\d]/g, ''), 10) || null : null;

        const powerEl = article.querySelector('dd[data-parameter="engine_power"]');
        const powerText = powerEl?.textContent?.trim() || '';
        const power = powerText ? parseInt(powerText.replace(/[^\d]/g, ''), 10) || null : null;

        const gearboxEl = article.querySelector('dd[data-parameter="gearbox"]');
        const transmission = gearboxEl?.textContent?.trim() || null;

        // Location
        const locationEl = article.querySelector('p[data-parameter="location"], dd[data-parameter="location"]');
        const location = locationEl?.textContent?.trim() || null;

        if (title && price > 0) {
          results.push({ title, price, currency: 'PLN', year, mileage, fuelType, engineCapacity, power, transmission, location, link });
        }
      } catch {
        // skip malformed articles
      }
    });

    return results;
  });
}
