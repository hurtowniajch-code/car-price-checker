import { ListingData, PriceStats } from '../types';

export function calculatePriceStats(listings: ListingData[], trimPercent: number = 5): PriceStats | null {
  const prices = listings
    .map((l) => l.price)
    .filter((p) => p > 0)
    .sort((a, b) => a - b);

  if (prices.length === 0) return null;

  // Trim extreme values from both ends
  let trimmed = prices;
  if (trimPercent > 0 && prices.length >= 4) {
    const trimCount = Math.floor(prices.length * (trimPercent / 100));
    if (trimCount > 0 && prices.length - trimCount * 2 >= 1) {
      trimmed = prices.slice(trimCount, prices.length - trimCount);
    }
  }

  const count = trimmed.length;
  const min = trimmed[0];
  const max = trimmed[count - 1];
  const sum = trimmed.reduce((a, b) => a + b, 0);
  const average = Math.round(sum / count);

  const mid = Math.floor(count / 2);
  const median = count % 2 === 0
    ? Math.round((trimmed[mid - 1] + trimmed[mid]) / 2)
    : trimmed[mid];

  return { count, min, max, average, median };
}
