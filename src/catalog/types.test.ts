import { describe, it, expect } from 'vitest';
import { CATEGORY_IDS, isCategoryId } from './types';

describe('category ids', () => {
  it('lists the two Otomoto categories we crawl', () => {
    expect(CATEGORY_IDS).toEqual(['osobowe', 'motocykle-i-quady']);
  });
  it('recognises a valid category id', () => {
    expect(isCategoryId('osobowe')).toBe(true);
    expect(isCategoryId('ciezarowe')).toBe(false);
  });
});
