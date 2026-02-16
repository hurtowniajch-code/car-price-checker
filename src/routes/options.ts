import { Router, Request, Response } from 'express';
import { scrapeOtomoto } from '../scraper/otomoto-scraper';
import { SearchParams } from '../types';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const { brand, model, generation, year, yearRange, mileage, mileageRange, damaged } = req.body;

  if (!brand || !model) {
    res.status(400).json({ success: false, error: 'Wymagane: marka, model.' });
    return;
  }

  const searchParams: SearchParams = {
    brand: brand.trim(),
    model: model.trim(),
    generation: generation || undefined,
    year: year ? parseInt(year, 10) : undefined,
    yearRange: yearRange !== undefined && yearRange !== '' ? parseInt(yearRange, 10) : undefined,
    mileage: mileage ? parseInt(mileage, 10) : undefined,
    mileageRange: mileageRange !== undefined && mileageRange !== '' ? parseInt(mileageRange, 10) : undefined,
    damaged: damaged || undefined,
  };

  try {
    console.log('[Options] Fetching options for:', searchParams);
    const { listings } = await scrapeOtomoto(searchParams, 1);

    const fuelTypes = [...new Set(
      listings.map((l) => l.fuelType).filter(Boolean) as string[]
    )].sort((a, b) => a.localeCompare(b, 'pl'));

    const engineCapacities = [...new Set(
      listings.map((l) => l.engineCapacity).filter((v): v is number => v !== null && v > 0)
    )].sort((a, b) => a - b);

    // Extract power values
    const powers = [...new Set(
      listings.map((l) => l.power).filter((v): v is number => v !== null && v !== undefined && v > 0)
    )].sort((a, b) => a - b);

    // Group engine capacities by fuel type
    const engineCapacitiesByFuel: Record<string, number[]> = {};
    for (const listing of listings) {
      if (!listing.fuelType || !listing.engineCapacity || listing.engineCapacity <= 0) continue;
      if (!engineCapacitiesByFuel[listing.fuelType]) {
        engineCapacitiesByFuel[listing.fuelType] = [];
      }
      if (!engineCapacitiesByFuel[listing.fuelType].includes(listing.engineCapacity)) {
        engineCapacitiesByFuel[listing.fuelType].push(listing.engineCapacity);
      }
    }
    // Sort each fuel type's capacities
    for (const fuel of Object.keys(engineCapacitiesByFuel)) {
      engineCapacitiesByFuel[fuel].sort((a, b) => a - b);
    }

    // Group powers by fuel type
    const powersByFuel: Record<string, number[]> = {};
    for (const listing of listings) {
      if (!listing.fuelType || !listing.power || listing.power <= 0) continue;
      if (!powersByFuel[listing.fuelType]) {
        powersByFuel[listing.fuelType] = [];
      }
      if (!powersByFuel[listing.fuelType].includes(listing.power)) {
        powersByFuel[listing.fuelType].push(listing.power);
      }
    }
    for (const fuel of Object.keys(powersByFuel)) {
      powersByFuel[fuel].sort((a, b) => a - b);
    }

    console.log(`[Options] Found ${fuelTypes.length} fuel types, ${engineCapacities.length} engine capacities, ${powers.length} power values`);

    res.json({
      success: true,
      fuelTypes,
      engineCapacities,
      engineCapacitiesByFuel,
      powers,
      powersByFuel,
      listingsScanned: listings.length,
    });
  } catch (error: any) {
    console.error('[Options] Failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
