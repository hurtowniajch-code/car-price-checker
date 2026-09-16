import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createCatalogRouter, REFRESH_COOLDOWN_MS } from './catalog';
import { saveCatalog, loadCatalog } from '../catalog/store';
import { Catalog, emptyCatalog } from '../catalog/types';
import { CAR_STATES, pageHtml } from '../catalog/__fixtures__/states';

const AT = '2026-09-16T10:00:00.000Z';
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-routes-'));
  const c: Catalog = emptyCatalog();
  c.categories.osobowe = {
    crawledAt: AT,
    brands: [{ slug: 'volkswagen', name: 'Volkswagen', count: 300, crawledAt: AT, models: [
      { slug: 'polo', name: 'Polo', count: 120, generations: [] },
      { slug: 'golf', name: 'Golf', count: 180, generations: [] },
    ] }],
  };
  saveCatalog(dir, c);
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

/** Minimal Express-like req/res so the handlers can be called directly. */
function call(handler: any, req: any) {
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    type: '',
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
    set(_k: string, v: string) { this.type = v; return this; },
    send(payload: any) { this.body = payload; return this; },
  };
  return handler({ query: {}, body: {}, ...req }, res).then?.(() => res) ?? Promise.resolve(res);
}

describe('GET /api/catalog', () => {
  it('returns the whole catalog', async () => {
    const router = createCatalogRouter({ dir, fetchPage: async () => '' });
    const res = await call(router.handlers.getCatalog, {});
    expect(res.body.success).toBe(true);
    expect(res.body.catalog.categories.osobowe.brands).toHaveLength(1);
  });

  it('returns one brand when asked', async () => {
    const router = createCatalogRouter({ dir, fetchPage: async () => '' });
    const res = await call(router.handlers.getCatalog, { query: { category: 'osobowe', brand: 'Volkswagen' } });
    expect(res.body.brand.models.map((m: any) => m.slug)).toEqual(['polo', 'golf']);
  });

  it('404s an unknown brand', async () => {
    const router = createCatalogRouter({ dir, fetchPage: async () => '' });
    const res = await call(router.handlers.getCatalog, { query: { category: 'osobowe', brand: 'Trabant' } });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/catalog/refresh', () => {
  const brandPage = pageHtml(CAR_STATES);

  it('merges the refreshed brand and reports the diff', async () => {
    const router = createCatalogRouter({ dir, fetchPage: async () => brandPage, now: () => AT });
    const res = await call(router.handlers.refresh, { body: { category: 'osobowe', brand: 'Volkswagen' } });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, models: 3, added: ['buggy'], removed: [] });
    const vw = loadCatalog(dir)!.categories.osobowe.brands[0];
    expect(vw.models.map((m) => m.slug)).toEqual(['polo', 'golf', 'buggy']);
  });

  it('refuses a second refresh of the same brand within the cooldown', async () => {
    const router = createCatalogRouter({ dir, fetchPage: async () => brandPage, now: () => AT });
    await call(router.handlers.refresh, { body: { category: 'osobowe', brand: 'Volkswagen' } });
    const res = await call(router.handlers.refresh, { body: { category: 'osobowe', brand: 'Volkswagen' } });
    expect(res.statusCode).toBe(429);
    expect(REFRESH_COOLDOWN_MS).toBe(10 * 60 * 1000);
  });

  it('503s and keeps the catalog when Otomoto cannot be read', async () => {
    const router = createCatalogRouter({ dir, fetchPage: async () => { throw new Error('HTTP 403'); } });
    const res = await call(router.handlers.refresh, { body: { category: 'osobowe', brand: 'Volkswagen' } });
    expect(res.statusCode).toBe(503);
    expect(loadCatalog(dir)!.categories.osobowe.brands[0].models).toHaveLength(2);
  });

  it('409s and keeps the catalog when the refreshed brand fails a check', async () => {
    // A page whose volkswagen has listings but no models.
    const thin = CAR_STATES.filter((s) => !(s.filterId === 'filter_enum_model' && s.conditions?.[0]?.value === 'volkswagen'));
    const router = createCatalogRouter({ dir, fetchPage: async () => pageHtml(thin) });
    const res = await call(router.handlers.refresh, { body: { category: 'osobowe', brand: 'Volkswagen' } });
    expect(res.statusCode).toBe(409);
    expect(loadCatalog(dir)!.categories.osobowe.brands[0].models).toHaveLength(2);
  });

  it('400s an unknown category', async () => {
    const router = createCatalogRouter({ dir, fetchPage: async () => brandPage });
    const res = await call(router.handlers.refresh, { body: { category: 'ciezarowe', brand: 'Volkswagen' } });
    expect(res.statusCode).toBe(400);
  });

  it('500s (without throwing) when saving the refreshed catalog fails', async () => {
    // Parent of `dir` is a plain file, so fs.mkdirSync inside saveCatalog throws ENOTDIR.
    const blocker = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-blocker-'));
    const blockerFile = path.join(blocker, 'blocker');
    fs.writeFileSync(blockerFile, 'x');
    const badDir = path.join(blockerFile, 'sub');
    const router = createCatalogRouter({ dir: badDir, fetchPage: async () => brandPage, now: () => AT });

    const res = await call(router.handlers.refresh, { body: { category: 'osobowe', brand: 'Volkswagen' } });

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ success: false, error: 'Nie udało się zapisać katalogu.' });
    fs.rmSync(blocker, { recursive: true, force: true });
  });

  it('rate-limits a failed refresh too, so a retry cannot skip the cooldown', async () => {
    let fetchCalls = 0;
    const router = createCatalogRouter({
      dir,
      fetchPage: async () => { fetchCalls++; throw new Error('HTTP 403'); },
      now: () => AT,
    });

    const first = await call(router.handlers.refresh, { body: { category: 'osobowe', brand: 'Volkswagen' } });
    expect(first.statusCode).toBe(503);

    const second = await call(router.handlers.refresh, { body: { category: 'osobowe', brand: 'Volkswagen' } });
    expect(second.statusCode).toBe(429);
    expect(fetchCalls).toBe(1);
  });
});

describe('generated js files', () => {
  it('serves brands-models.js built from the catalog', async () => {
    const router = createCatalogRouter({ dir, fetchPage: async () => '' });
    const res = await call(router.handlers.brandsModelsJs, {});
    expect(res.type).toBe('application/javascript; charset=utf-8');
    expect(res.body).toContain('const BRANDS_MODELS =');
    expect(res.body).toContain('Polo');
  });

  it('hands over to the static file when there is no catalog', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-none-'));
    const router = createCatalogRouter({ dir: empty, fetchPage: async () => '' });
    let handedOver = false;
    const res: any = { set() { return this; }, send(b: any) { this.body = b; return this; } };
    await router.handlers.brandsModelsJs({} as any, res, () => { handedOver = true; });
    expect(handedOver).toBe(true); // express.static then serves public/js/brands-models.js
    expect(res.body).toBeUndefined();
    fs.rmSync(empty, { recursive: true, force: true });
  });
});
