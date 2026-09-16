import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildProxyUrl, categoryUrl, brandUrl, fetchOtomotoPage, ROTATING_USER_AGENTS } from './fetch-page';

const saved = { url: process.env.PROXY_URL, user: process.env.PROXY_USER, pass: process.env.PROXY_PASS };

beforeEach(() => { delete process.env.PROXY_URL; delete process.env.PROXY_USER; delete process.env.PROXY_PASS; });
afterEach(() => {
  process.env.PROXY_URL = saved.url; process.env.PROXY_USER = saved.user; process.env.PROXY_PASS = saved.pass;
});

describe('buildProxyUrl', () => {
  it('returns null when no proxy is configured', () => {
    expect(buildProxyUrl()).toBeNull();
  });
  it('builds a proxy url with credentials', () => {
    process.env.PROXY_URL = '1.2.3.4:6754';
    process.env.PROXY_USER = 'user';
    process.env.PROXY_PASS = 'pass';
    expect(buildProxyUrl()).toBe('http://user:pass@1.2.3.4:6754');
  });
  it('strips a scheme already present in PROXY_URL', () => {
    process.env.PROXY_URL = 'http://1.2.3.4:6754';
    expect(buildProxyUrl()).toBe('http://1.2.3.4:6754');
  });
});

describe('urls', () => {
  it('builds the category url', () => {
    expect(categoryUrl('osobowe')).toBe('https://www.otomoto.pl/osobowe');
    expect(categoryUrl('motocykle-i-quady')).toBe('https://www.otomoto.pl/motocykle-i-quady');
  });
  it('builds the brand url from the Otomoto slug', () => {
    expect(brandUrl('osobowe', 'volkswagen')).toBe('https://www.otomoto.pl/osobowe/volkswagen');
  });
});

describe('fetchOtomotoPage', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('times out a hung connection instead of blocking forever', async () => {
    const url = 'https://www.otomoto.pl/osobowe';
    globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

    const start = Date.now();
    await expect(fetchOtomotoPage(url, 1, 50)).rejects.toThrow(/timeout/i);
    expect(Date.now() - start).toBeLessThan(1000);
    await expect(fetchOtomotoPage(url, 1, 50)).rejects.toThrow(url);
  });

  it('retries a 403 and throws an error mentioning it (distinguishable from a network error)', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 403 } as Response)
    ) as unknown as typeof fetch;

    await expect(fetchOtomotoPage('https://www.otomoto.pl/osobowe', 2, 50)).rejects.toThrow(/403/);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('sends the same rotating User-Agent / header set as the price scraper', async () => {
    let capturedOptions: any;
    globalThis.fetch = vi.fn((_url: any, options: any) => {
      capturedOptions = options;
      return Promise.resolve({ ok: true, text: () => Promise.resolve('<html></html>') } as Response);
    }) as unknown as typeof fetch;

    await fetchOtomotoPage('https://www.otomoto.pl/osobowe', 1, 50);

    expect(capturedOptions.headers['Accept-Language']).toBe('pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7');
    expect(ROTATING_USER_AGENTS).toContain(capturedOptions.headers['User-Agent']);
  });
});
