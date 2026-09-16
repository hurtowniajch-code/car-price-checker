import { ProxyAgent } from 'undici';
import { CategoryId } from './types';

/** Same rotating User-Agent list as the price scraper (otomoto-fetch-scraper.ts). */
export const ROTATING_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

function randomUserAgent(): string {
  return ROTATING_USER_AGENTS[Math.floor(Math.random() * ROTATING_USER_AGENTS.length)];
}

/** Same header set as the price scraper (otomoto-fetch-scraper.ts): duplicated intentionally, keep the two modules independent. */
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

/** Default per-attempt timeout for fetchOtomotoPage. */
export const FETCH_TIMEOUT_MS = 30_000;

export function categoryUrl(category: CategoryId): string {
  return `https://www.otomoto.pl/${category}`;
}

export function brandUrl(category: CategoryId, brandSlug: string): string {
  return `https://www.otomoto.pl/${category}/${brandSlug}`;
}

/** Same proxy convention as the price scraper: PROXY_URL (+ optional PROXY_USER/PROXY_PASS). */
export function buildProxyUrl(): string | null {
  const proxyUrl = process.env.PROXY_URL;
  if (!proxyUrl) return null;
  const bare = proxyUrl.replace(/^https?:\/\//, '');
  const user = process.env.PROXY_USER;
  const pass = process.env.PROXY_PASS;
  return user && pass ? `http://${user}:${pass}@${bare}` : `http://${bare}`;
}

/** How the catalog code reaches Otomoto; injected in tests. */
export type PageFetcher = (url: string) => Promise<string>;

/**
 * Fetch a page as HTML, retrying transient failures (including a per-attempt
 * timeout so a proxy that never responds cannot stall the crawl forever).
 * Throws when every attempt fails.
 */
export async function fetchOtomotoPage(
  url: string,
  retries = 3,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<string> {
  const proxy = buildProxyUrl();
  const options: Record<string, unknown> = {
    headers: buildFetchHeaders(),
    redirect: 'follow',
  };
  if (proxy) options.dispatcher = new ProxyAgent(proxy);

  let lastError = '';
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    // Definite-assignment: the Promise executor below runs synchronously.
    let timer!: ReturnType<typeof setTimeout>;
    // Race the real fetch against our own timer, rather than relying solely on
    // fetch()/undici honouring AbortSignal — that keeps a hung connection (or a
    // proxy that swallows the signal) from blocking the crawl forever regardless.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`timeout after ${timeoutMs}ms fetching ${url}`));
      }, timeoutMs);
    });
    try {
      const response = await Promise.race([
        fetch(url, { ...options, signal: controller.signal } as RequestInit),
        timeout,
      ]);
      if (response.ok) return await response.text();
      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = (err as Error).message;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw new Error(`could not fetch ${url}: ${lastError}`);
}
