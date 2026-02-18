import { Router, Request, Response } from 'express';
import { scrapeOtomotoFast } from '../scraper/otomoto-fetch-scraper';
import { calculatePriceStats } from '../analysis/price-stats';
import { SearchParams, EstimateResponse } from '../types';

const router = Router();

// Simple in-memory cache (10-minute TTL)
const cache = new Map<string, { data: EstimateResponse; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000;

function getCacheKey(params: SearchParams): string {
  return JSON.stringify({
    brand: params.brand.toLowerCase(),
    model: params.model.toLowerCase(),
    generation: params.generation,
    year: params.year,
    yearRange: params.yearRange,
    mileage: params.mileage,
    mileageRange: params.mileageRange,
    version: params.version?.toLowerCase(),
    fuelType: params.fuelType?.toLowerCase(),
    engineCapacity: params.engineCapacity,
    power: params.power,
    transmission: params.transmission?.toLowerCase(),
    damaged: params.damaged,
    trimPercent: params.trimPercent,
  });
}

router.post('/', async (req: Request, res: Response) => {
  const { brand, model, generation, generationYearFrom, generationYearTo, year, yearRange, mileage, mileageRange, version, fuelType, engineCapacity, power, transmission, damaged, trimPercent } = req.body;

  // Validate required fields
  if (!brand || !model) {
    res.status(400).json({
      success: false,
      error: 'Wymagane pola: marka, model.',
      searchParams: { brand, model },
      searchUrl: '',
      stats: null,
      listings: [],
      scrapedAt: new Date().toISOString(),
    } as EstimateResponse);
    return;
  }

  const searchParams: SearchParams = {
    brand: brand.trim(),
    model: model.trim(),
    generation: generation || undefined,
    generationYearFrom: generationYearFrom ? parseInt(generationYearFrom, 10) : undefined,
    generationYearTo: generationYearTo ? parseInt(generationYearTo, 10) : undefined,
    year: year ? parseInt(year, 10) : undefined,
    yearRange: yearRange !== undefined && yearRange !== '' ? parseInt(yearRange, 10) : undefined,
    mileage: mileage ? parseInt(mileage, 10) : undefined,
    mileageRange: mileageRange !== undefined && mileageRange !== '' ? parseInt(mileageRange, 10) : undefined,
    version: version?.trim() || undefined,
    fuelType: fuelType || undefined,
    engineCapacity: engineCapacity ? parseInt(engineCapacity, 10) : undefined,
    power: power ? parseInt(power, 10) : undefined,
    transmission: transmission || undefined,
    damaged: damaged || undefined,
    trimPercent: trimPercent !== undefined && trimPercent !== '' ? parseInt(trimPercent, 10) : 5,
  };

  // Check cache
  const cacheKey = getCacheKey(searchParams);
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[API] Returning cached result');
    res.json(cached.data);
    return;
  }

  try {
    console.log('[API] Starting scrape for:', searchParams);
    const { listings: rawListings, searchUrl, method } = await scrapeOtomotoFast(searchParams);
    console.log(`[API] Scrape method used: ${method}`);

    // Post-filter results by optional criteria
    let listings = rawListings;

    if (searchParams.version) {
      // Normalize: remove spaces, hyphens, dots → "s line" / "s-line" / "sline" all become "sline"
      const normalize = (s: string) => s.toLowerCase().replace(/[\s\-\.]/g, '');
      const versionNorm = normalize(searchParams.version);
      listings = listings.filter((l) =>
        normalize(l.title).includes(versionNorm)
      );
    }

    if (searchParams.fuelType) {
      const fuelLower = searchParams.fuelType.toLowerCase();
      const fuelValues = [...new Set(listings.map((l) => l.fuelType))];
      console.log(`[API] Filtering by fuel: "${searchParams.fuelType}" | Listings fuel types:`, fuelValues);
      listings = listings.filter((l) =>
        l.fuelType && l.fuelType.toLowerCase().includes(fuelLower)
      );
      console.log(`[API] After fuel filter: ${listings.length} listings remain`);
    }

    if (searchParams.transmission) {
      const transValues = [...new Set(listings.map((l) => l.transmission))];
      console.log(`[API] Filtering by transmission: "${searchParams.transmission}" | Listings transmissions:`, transValues);
      // Map form values to Polish otomoto values
      const transMap: Record<string, string[]> = {
        'manual': ['manualna', 'manual'],
        'automatic': ['automatyczna', 'automatic', 'automat'],
      };
      const transLower = searchParams.transmission.toLowerCase();
      const matchTerms = transMap[transLower] || [transLower];
      listings = listings.filter((l) => {
        if (!l.transmission) return false;
        const lt = l.transmission.toLowerCase();
        return matchTerms.some((term) => lt.includes(term));
      });
      console.log(`[API] After transmission filter: ${listings.length} listings remain`);
    }

    const stats = calculatePriceStats(listings, searchParams.trimPercent ?? 5);

    const response: EstimateResponse = {
      success: true,
      searchParams,
      searchUrl,
      stats,
      listings: listings.sort((a, b) => a.price - b.price),
      scrapedAt: new Date().toISOString(),
    };

    // Store in cache
    cache.set(cacheKey, { data: response, timestamp: Date.now() });

    // Clean old cache entries
    for (const [key, entry] of cache.entries()) {
      if (Date.now() - entry.timestamp > CACHE_TTL) {
        cache.delete(key);
      }
    }

    res.json(response);
  } catch (error: any) {
    console.error('[API] Scraping failed:', error);
    res.status(500).json({
      success: false,
      searchParams,
      searchUrl: '',
      stats: null,
      listings: [],
      scrapedAt: new Date().toISOString(),
      error: `Błąd scrapowania: ${error.message}`,
    } as EstimateResponse);
  }
});

export default router;
