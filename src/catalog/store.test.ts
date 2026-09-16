import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadCatalog, saveCatalog, catalogPath } from './store';
import { emptyCatalog } from './types';

let dir: string;

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('loadCatalog', () => {
  it('returns null when there is no catalog yet', () => {
    expect(loadCatalog(dir)).toBeNull();
  });
  it('returns null for an unreadable catalog instead of throwing', () => {
    fs.writeFileSync(catalogPath(dir), '{ this is not json');
    expect(loadCatalog(dir)).toBeNull();
  });
  it('reads back what was saved', () => {
    const c = emptyCatalog();
    c.categories.osobowe = { crawledAt: 'now', brands: [{ slug: 'vw', name: 'VW', count: 1, crawledAt: 'now', models: [] }] };
    saveCatalog(dir, c);
    expect(loadCatalog(dir)).toEqual(c);
  });
});

describe('saveCatalog', () => {
  it('creates the directory if missing', () => {
    const nested = path.join(dir, 'data');
    saveCatalog(nested, emptyCatalog());
    expect(fs.existsSync(catalogPath(nested))).toBe(true);
  });
  it('keeps the previous catalog as .bak', () => {
    const first = emptyCatalog();
    first.categories.osobowe.crawledAt = 'first';
    saveCatalog(dir, first);
    const second = emptyCatalog();
    second.categories.osobowe.crawledAt = 'second';
    saveCatalog(dir, second);

    expect(loadCatalog(dir)!.categories.osobowe.crawledAt).toBe('second');
    const bak = JSON.parse(fs.readFileSync(catalogPath(dir) + '.bak', 'utf8'));
    expect(bak.categories.osobowe.crawledAt).toBe('first');
  });
  it('leaves no temp file behind', () => {
    saveCatalog(dir, emptyCatalog());
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});
