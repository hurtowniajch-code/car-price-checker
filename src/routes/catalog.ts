import { Router, Request, Response, NextFunction } from 'express';
import { loadCatalog, saveCatalog, DEFAULT_DIR } from '../catalog/store';
import { extractCategory } from '../catalog/extract';
import { validateCategory } from '../catalog/validate';
import { mergeBrand } from '../catalog/merge';
import { brandsModelsJs, generationsJs } from '../catalog/js-files';
import { fetchOtomotoPage, PageFetcher, brandUrl } from '../catalog/fetch-page';
import { CategoryId, isCategoryId, emptyCatalog } from '../catalog/types';

/** One refresh per brand per 10 minutes — the page is public and each refresh costs a proxy request. */
export const REFRESH_COOLDOWN_MS = 10 * 60 * 1000;

interface Options {
  dir?: string;
  fetchPage?: PageFetcher;
  now?: () => string;
}

export function createCatalogRouter(options: Options = {}) {
  const dir = options.dir ?? DEFAULT_DIR;
  const fetchPage = options.fetchPage ?? fetchOtomotoPage;
  const now = options.now ?? (() => new Date().toISOString());
  const lastRefresh = new Map<string, number>();

  async function getCatalog(req: Request, res: Response) {
    try {
      const catalog = loadCatalog(dir);
      if (!catalog) {
        res.status(404).json({ success: false, error: 'Katalog nie został jeszcze pobrany.' });
        return;
      }
      const category = String(req.query.category ?? 'osobowe');
      const brandName = req.query.brand ? String(req.query.brand) : null;
      if (!brandName) {
        res.json({ success: true, catalog });
        return;
      }
      if (!isCategoryId(category)) {
        res.status(400).json({ success: false, error: `Nieznana kategoria: ${category}` });
        return;
      }
      const brand = catalog.categories[category].brands.find(
        (b) => b.name.toLowerCase() === brandName.toLowerCase() || b.slug === brandName.toLowerCase(),
      );
      if (!brand) {
        res.status(404).json({ success: false, error: `Nieznana marka: ${brandName}` });
        return;
      }
      res.json({ success: true, brand });
    } catch (err) {
      console.error('[catalog] getCatalog failed unexpectedly:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Wystąpił nieoczekiwany błąd.' });
      }
    }
  }

  async function refresh(req: Request, res: Response) {
    try {
      const category = String(req.body.category ?? 'osobowe');
      const brandName = String(req.body.brand ?? '').trim();

      if (!isCategoryId(category)) {
        res.status(400).json({ success: false, error: `Nieznana kategoria: ${category}` });
        return;
      }
      if (!brandName) {
        res.status(400).json({ success: false, error: 'Podaj markę.' });
        return;
      }

      const catalog = loadCatalog(dir) ?? emptyCatalog();
      const categoryId = category as CategoryId;
      const known = catalog.categories[categoryId].brands.find(
        (b) => b.name.toLowerCase() === brandName.toLowerCase() || b.slug === brandName.toLowerCase(),
      );
      const brandSlug = known?.slug ?? brandName.toLowerCase().replace(/\s+/g, '-');

      const key = `${categoryId}|${brandSlug}`;
      const last = lastRefresh.get(key);
      if (last && Date.now() - last < REFRESH_COOLDOWN_MS) {
        const wait = Math.ceil((REFRESH_COOLDOWN_MS - (Date.now() - last)) / 60000);
        res.status(429).json({ success: false, error: `Odświeżono niedawno — spróbuj za ${wait} min.` });
        return;
      }
      // Start the cooldown now, before the proxied Otomoto fetch, not after a
      // successful save: every attempt past this point costs a real proxy
      // request, so it must count against the limit whether it goes on to
      // succeed, 503, 404, 409 or fail to save. Trade-off: a transient failure
      // (e.g. Otomoto hiccup, disk full) also blocks a legitimate retry of the
      // same brand for the full cooldown — acceptable for a public,
      // unauthenticated endpoint whose whole purpose is limiting proxy spend.
      lastRefresh.set(key, Date.now());

      let brand;
      try {
        const html = await fetchPage(brandUrl(categoryId, brandSlug));
        const fresh = extractCategory(html, now());
        brand = fresh.brands.find((b) => b.slug === brandSlug);
      } catch (err) {
        res.status(503).json({ success: false, error: `Otomoto nie odpowiada: ${(err as Error).message}` });
        return;
      }

      if (!brand) {
        res.status(404).json({ success: false, error: `Nieznana marka: ${brandName}` });
        return;
      }

      const merged = mergeBrand(catalog, categoryId, brand);
      const problems = validateCategory(categoryId, merged.catalog.categories[categoryId], catalog.categories[categoryId])
        .filter((p) => p.brand === brandSlug);
      if (problems.length > 0) {
        res.status(409).json({ success: false, error: `Dane z Otomoto wyglądają niekompletnie: ${problems[0].message}` });
        return;
      }

      try {
        saveCatalog(dir, merged.catalog);
      } catch (err) {
        console.error(`[catalog] failed to save catalog after refreshing ${key}:`, err);
        res.status(500).json({ success: false, error: 'Nie udało się zapisać katalogu.' });
        return;
      }

      res.json({
        success: true,
        brand: brand.name,
        models: brand.models.length,
        added: merged.added,
        removed: merged.removed,
        crawledAt: brand.crawledAt,
      });
    } catch (err) {
      console.error('[catalog] refresh handler failed unexpectedly:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Wystąpił nieoczekiwany błąd.' });
      }
    }
  }

  function sendJs(res: Response, next: NextFunction, body: string | null) {
    if (!body) {
      // No catalog yet — hand over to express.static, which serves public/js/<file>.
      next();
      return;
    }
    res.set('Content-Type', 'application/javascript; charset=utf-8').send(body);
  }

  async function brandsModelsJsHandler(_req: Request, res: Response, next: NextFunction) {
    try {
      const catalog = loadCatalog(dir);
      sendJs(res, next, catalog ? brandsModelsJs(catalog) : null);
    } catch (err) {
      console.error('[catalog] brandsModelsJs failed unexpectedly:', err);
      next();
    }
  }

  async function generationsJsHandler(_req: Request, res: Response, next: NextFunction) {
    try {
      const catalog = loadCatalog(dir);
      sendJs(res, next, catalog ? generationsJs(catalog) : null);
    } catch (err) {
      console.error('[catalog] generationsJs failed unexpectedly:', err);
      next();
    }
  }

  const router = Router();
  router.get('/api/catalog', getCatalog);
  router.post('/api/catalog/refresh', refresh);
  router.get('/js/brands-models.js', brandsModelsJsHandler);
  router.get('/js/generations.js', generationsJsHandler);

  return {
    router,
    handlers: {
      getCatalog,
      refresh,
      brandsModelsJs: brandsModelsJsHandler,
      generationsJs: generationsJsHandler,
    },
  };
}
