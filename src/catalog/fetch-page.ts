import { ProxyAgent } from 'undici';
import { CategoryId } from './types';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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

/** Fetch a page as HTML, retrying transient failures. Throws when every attempt fails. */
export async function fetchOtomotoPage(url: string, retries = 3): Promise<string> {
  const proxy = buildProxyUrl();
  const options: Record<string, unknown> = {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pl-PL,pl;q=0.9', Accept: 'text/html' },
    redirect: 'follow',
  };
  if (proxy) options.dispatcher = new ProxyAgent(proxy);

  let lastError = '';
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options as RequestInit);
      if (response.ok) return await response.text();
      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = (err as Error).message;
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw new Error(`could not fetch ${url}: ${lastError}`);
}
