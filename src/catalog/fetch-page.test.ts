import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildProxyUrl, categoryUrl, brandUrl } from './fetch-page';

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
