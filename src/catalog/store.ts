import * as fs from 'fs';
import * as path from 'path';
import { Catalog } from './types';

/** Where the catalog lives in production. */
export const DEFAULT_DIR = path.join(process.cwd(), 'data');

export function catalogPath(dir: string = DEFAULT_DIR): string {
  return path.join(dir, 'catalog.json');
}

/**
 * Read the catalog, or null when there is no catalog yet or it is corrupt.
 * A real filesystem error (permissions, IO, EISDIR, ...) is NOT the same as
 * "no catalog yet" — it is logged loudly so it doesn't look like an empty
 * catalog and get silently served as such.
 */
export function loadCatalog(dir: string = DEFAULT_DIR): Catalog | null {
  const file = catalogPath(dir);
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') return null;
    console.error(`[catalog] filesystem error reading ${file} (not a missing catalog):`, error);
    return null;
  }

  try {
    return JSON.parse(raw) as Catalog;
  } catch (err) {
    console.warn(`[catalog] catalog file ${file} is corrupt JSON, ignoring it:`, err);
    return null;
  }
}

/** Write atomically: temp file → rename, keeping the previous catalog as .bak. */
export function saveCatalog(dir: string = DEFAULT_DIR, catalog: Catalog): void {
  const file = catalogPath(dir);
  fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(file)) {
    fs.copyFileSync(file, `${file}.bak`);
  }

  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(catalog), 'utf8');
  fs.renameSync(tmp, file);
}
