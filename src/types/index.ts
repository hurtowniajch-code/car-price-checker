export interface SearchParams {
  brand: string;
  model: string;
  generation?: string;
  generationYearFrom?: number;
  generationYearTo?: number;
  year?: number;
  yearRange?: number;
  mileage?: number;
  mileageRange?: number;
  version?: string;
  fuelType?: string;
  engineCapacity?: number;
  power?: number;
  transmission?: string;
  damaged?: string;
  trimPercent?: number;
}

export interface ListingData {
  title: string;
  price: number;
  currency: string;
  year: number | null;
  mileage: number | null;
  fuelType: string | null;
  engineCapacity: number | null;
  power: number | null;
  transmission: string | null;
  location: string | null;
  link: string;
}

export interface PriceStats {
  count: number;
  min: number;
  max: number;
  average: number;
  median: number;
}

export interface EstimateResponse {
  success: boolean;
  searchParams: SearchParams;
  searchUrl: string;
  stats: PriceStats | null;
  listings: ListingData[];
  scrapedAt: string;
  error?: string;
}
