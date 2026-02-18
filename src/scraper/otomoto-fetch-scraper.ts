/**
 * Fetch-based scraper for Otomoto.
 * Uses plain HTTP requests instead of Puppeteer/Chrome.
 * ~10-50x faster, uses ~5MB RAM instead of ~400MB.
 *
 * Falls back to Puppeteer if Otomoto returns a Cloudflare challenge page
 * (no __NEXT_DATA__ in response).
 */

import { ProxyAgent } from 'undici';
import { SearchParams, ListingData } from '../types';
import { buildOtomotoUrl } from './url-builder';
import { scrapeOtomoto as puppeteerScrape } from './otomoto-scraper';

const MAX_PAGES = 5;
const PAGE_SIZE = 32;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function buildFetchHeaders(): Record<string, string> {
  return {
    'User-Agent': randomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'max-age=0',
  };
}

function buildProxyUrl(): string | null {
  const proxyUrl = process.env.PROXY_URL;
  const proxyUser = process.env.PROXY_USER;
  const proxyPass = process.env.PROXY_PASS;
  if (!proxyUrl) return null;
  // Strip any existing scheme — PROXY_URL may be "host:port" or "http://host:port"
  const bare = proxyUrl.replace(/^https?:\/\//, '');
  if (proxyUser && proxyPass) {
    return `http://${proxyUser}:${proxyPass}@${bare}`;
  }
  return `http://${bare}`;
}

async function fetchPage(url: string): Promise<string | null> {
  const proxyUrlStr = buildProxyUrl();

  // Build fetch options — proxy via undici if available
  const fetchOptions: any = {
    headers: buildFetchHeaders(),
    redirect: 'follow',
  };

  if (proxyUrlStr) {
    fetchOptions.dispatcher = new ProxyAgent(proxyUrlStr);
    console.log(`[FetchScraper] Using proxy`);
  }

  try {
    const response = await fetch(url, fetchOptions);
    if (!response.ok) {
      console.log(`[FetchScraper] HTTP ${response.status}`);
      return null;
    }
    return await response.text();
  } catch (err: any) {
    console.log(`[FetchScraper] Fetch error: ${err.message}`);
    return null;
  }
}

function extractNextData(html: string): { listings: ListingData[]; totalCount: number } | null {
  // Extract __NEXT_DATA__ JSON from <script id="__NEXT_DATA__" type="application/json">...</script>
  const match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;

  try {
    const data = JSON.parse(match[1]);
    const urqlState = data?.props?.pageProps?.urqlState;
    if (!urqlState) return null;

    for (const key of Object.keys(urqlState)) {
      const entry = urqlState[key];
      if (typeof entry?.data !== 'string' || !entry.data.includes('advertSearch')) continue;

      const parsed = JSON.parse(entry.data);
      const edges = parsed?.advertSearch?.edges;
      if (!Array.isArray(edges) || edges.length === 0) continue;

      const totalCount = parsed?.advertSearch?.totalCount || 0;

      const listings: ListingData[] = edges.map((edge: any) => {
        const node = edge.node;
        if (!node) return null;

        const params = node.parameters || [];
        const getParam = (k: string) => params.find((p: any) => p.key === k);

        let price = 0;
        if (node.price?.amount?.units) {
          price = node.price.amount.units;
        } else if (node.price?.amount) {
          price = typeof node.price.amount === 'number'
            ? node.price.amount
            : parseInt(String(node.price.amount).replace(/[^\d]/g, ''), 10);
        }
        if (!price) {
          const pp = getParam('price');
          if (pp) price = parseInt(String(pp.value).replace(/[^\d]/g, ''), 10) || 0;
        }

        const yearParam = getParam('year');
        const year = yearParam ? parseInt(yearParam.value, 10) : null;

        const mileParam = getParam('mileage');
        const mileage = mileParam ? parseInt(String(mileParam.value).replace(/[^\d]/g, ''), 10) : null;

        const fuelParam = getParam('fuel_type');
        const fuelType = fuelParam?.displayValue || null;

        const engineParam = getParam('engine_capacity');
        const engineCapacity = engineParam ? parseInt(String(engineParam.value).replace(/[^\d]/g, ''), 10) || null : null;

        const powerParam = getParam('engine_power');
        const power = powerParam ? parseInt(String(powerParam.value).replace(/[^\d]/g, ''), 10) || null : null;

        const gearboxParam = getParam('gearbox');
        const transmission = gearboxParam?.displayValue || null;

        let location: string | null = null;
        if (node.location?.city?.name) location = node.location.city.name;
        else if (node.location?.region?.name) location = node.location.region.name;

        return {
          title: node.title || '',
          price,
          currency: node.price?.currency || 'PLN',
          year,
          mileage,
          fuelType,
          engineCapacity,
          power,
          transmission,
          location,
          link: node.url || '',
        };
      }).filter((l): l is ListingData => l !== null && l.title !== '' && l.price > 0);

      return { listings, totalCount };
    }

    return null;
  } catch {
    return null;
  }
}

export async function scrapeOtomotoFast(
  params: SearchParams,
  maxPages: number = MAX_PAGES
): Promise<{ listings: ListingData[]; searchUrl: string; method: 'fetch' | 'puppeteer' }> {
  const searchUrl = buildOtomotoUrl(params, 1);
  const allListings: ListingData[] = [];
  const seenLinks = new Set<string>();

  console.log(`[FetchScraper] Starting fast scrape`);

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const url = buildOtomotoUrl(params, pageNum);
    console.log(`[FetchScraper] Page ${pageNum}: ${url}`);

    const html = await fetchPage(url);

    if (!html) {
      if (pageNum === 1) {
        console.log(`[FetchScraper] No response on page 1 — falling back to Puppeteer`);
        const fallback = await puppeteerScrape(params, maxPages);
        return { ...fallback, method: 'puppeteer' };
      }
      console.log(`[FetchScraper] No response on page ${pageNum}, stopping`);
      break;
    }

    const result = extractNextData(html);

    if (!result) {
      // Cloudflare or unexpected page — check if it's the first page
      if (pageNum === 1) {
        console.log(`[FetchScraper] No __NEXT_DATA__ on page 1 — falling back to Puppeteer`);
        const fallback = await puppeteerScrape(params, maxPages);
        return { ...fallback, method: 'puppeteer' };
      }
      console.log(`[FetchScraper] No __NEXT_DATA__ on page ${pageNum}, stopping`);
      break;
    }

    const { listings, totalCount } = result;

    if (listings.length === 0) {
      console.log(`[FetchScraper] No listings on page ${pageNum}, stopping`);
      break;
    }

    for (const listing of listings) {
      if (!seenLinks.has(listing.link)) {
        seenLinks.add(listing.link);
        allListings.push(listing);
      }
    }

    console.log(`[FetchScraper] Page ${pageNum}: ${listings.length} listings (total: ${allListings.length}, totalCount: ${totalCount})`);

    const totalPages = totalCount > 0 ? Math.ceil(totalCount / PAGE_SIZE) : 1;
    if (pageNum >= totalPages) {
      console.log(`[FetchScraper] Last page reached (${pageNum}/${totalPages})`);
      break;
    }

    // Small polite delay between pages
    if (pageNum < maxPages) await new Promise(r => setTimeout(r, 500));
  }

  return { listings: allListings, searchUrl, method: 'fetch' };
}
