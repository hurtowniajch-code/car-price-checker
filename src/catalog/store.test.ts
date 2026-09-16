import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  it('warns when the catalog file is corrupt JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fs.writeFileSync(catalogPath(dir), '{ this is not json');
    expect(loadCatalog(dir)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it('logs an error (and still returns null) for a real filesystem error, not a missing catalog', () => {
    // Reading a directory as if it were a file throws EISDIR, not ENOENT.
    fs.mkdirSync(catalogPath(dir));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(loadCatalog(dir)).toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
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
  it('leaves no temp file behind when the save fails', () => {
    saveCatalog(dir, emptyCatalog()); // so a .bak copy is also attempted
    const circular: any = emptyCatalog();
    circular.self = circular;
    expect(() => saveCatalog(dir, circular)).toThrow();
    expect(fs.readdirSync(dir).filter((f) => f.includes('.tmp'))).toEqual([]);
  });
});
