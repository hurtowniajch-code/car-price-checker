// Maps fuel type display values (Polish from scraper) to otomoto.pl URL enum values (English)
export const fuelTypeMap: Record<string, string> = {
  'diesel': 'diesel',
  'benzyna': 'petrol',
  'petrol': 'petrol',
  'hybryda': 'hybrid',
  'hybrid': 'hybrid',
  'elektryczny': 'electric',
  'electric': 'electric',
  'lpg': 'lpg',
  'cng': 'cng',
  'benzyna+lpg': 'petrol-lpg',
};

// Maps transmission types to otomoto.pl URL enum values
export const transmissionMap: Record<string, string> = {
  'manual': 'manual',
  'manualna': 'manual',
  'automatic': 'automatic',
  'automatyczna': 'automatic',
};

export function mapFuelType(fuel: string): string | undefined {
  return fuelTypeMap[fuel.toLowerCase()];
}

export function mapTransmission(trans: string): string | undefined {
  return transmissionMap[trans.toLowerCase()];
}
