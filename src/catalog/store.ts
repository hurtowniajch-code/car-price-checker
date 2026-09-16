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

/**
 * Write atomically: temp file → rename, keeping the previous catalog as .bak.
 *
 * CONCURRENCY NOTE: this is a read-modify-write with no locking. Two writers
 * (the crawl script and the per-brand refresh API) both load the whole
 * catalog, edit it, and write it back — if they run at the same time, the
 * second write clobbers the first writer's changes. The crawl and a refresh
 * must therefore never be run concurrently; the last writer wins and there is
 * no merge. This is a deliberate limitation, not an oversight — do not add
 * file locking to "fix" it without discussing the tradeoff first.
 */
export function saveCatalog(dir: string = DEFAULT_DIR, catalog: Catalog): void {
  const file = catalogPath(dir);
  fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(file)) {
    // Copy the previous catalog to .bak atomically too: copy-then-rename
    // instead of copying straight onto `${file}.bak`, so a crash or error
    // mid-copy can never leave a half-written .bak in place of a good one.
    const bakTmp = `${file}.bak.tmp`;
    try {
      fs.copyFileSync(file, bakTmp);
      fs.renameSync(bakTmp, `${file}.bak`);
    } catch (err) {
      fs.rmSync(bakTmp, { force: true });
      throw err;
    }
  }

  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(catalog), 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}
