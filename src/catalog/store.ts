import * as fs from 'fs';
import * as path from 'path';
import { Catalog } from './types';

/** Where the catalog lives in production. */
export const DEFAULT_DIR = path.join(process.cwd(), 'data');

export function catalogPath(dir: string = DEFAULT_DIR): string {
  return path.join(dir, 'catalog.json');
}

/** Read the catalog, or null when it is missing or unreadable. */
export function loadCatalog(dir: string = DEFAULT_DIR): Catalog | null {
  try {
    return JSON.parse(fs.readFileSync(catalogPath(dir), 'utf8')) as Catalog;
  } catch {
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
