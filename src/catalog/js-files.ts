import { Catalog, CatalogCategory } from './types';

const byName = (a: string, b: string) => a.localeCompare(b, 'pl');

function brandsModelsMap(category: CatalogCategory): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const brand of [...category.brands].sort((a, b) => byName(a.name, b.name))) {
    map[brand.name] = brand.models.map((m) => m.name).sort(byName);
  }
  return map;
}

/** The globals public/js/app.js expects, generated from the catalog. */
export function brandsModelsJs(catalog: Catalog): string {
  const cars = brandsModelsMap(catalog.categories.osobowe);
  const moto = brandsModelsMap(catalog.categories['motocykle-i-quady']);

  return `// Generated from data/catalog.json — do not edit by hand.
const BRANDS_MODELS = ${JSON.stringify(cars)};
const BRANDS_MODELS_MOTO = ${JSON.stringify(moto)};

const MODEL_TO_BRAND = {};
for (const [brand, models] of Object.entries(BRANDS_MODELS)) {
  for (const model of models) {
    const key = model.toLowerCase();
    if (!MODEL_TO_BRAND[key]) MODEL_TO_BRAND[key] = brand;
  }
}

const ALL_BRANDS = Object.keys(BRANDS_MODELS).sort((a, b) => a.localeCompare(b, 'pl'));

const ALL_MODELS = [];
for (const [brand, models] of Object.entries(BRANDS_MODELS)) {
  for (const model of models) ALL_MODELS.push({ brand, model });
}
ALL_MODELS.sort((a, b) => a.model.localeCompare(b.model, 'pl'));
`;
}

export function generationsJs(catalog: Catalog): string {
  const generations: Record<string, Record<string, { name: string; slug: string }[]>> = {};
  for (const brand of catalog.categories.osobowe.brands) {
    for (const model of brand.models) {
      if (model.generations.length === 0) continue;
      if (!generations[brand.name]) generations[brand.name] = {};
      generations[brand.name][model.name] = model.generations.map((g) => ({ name: g.name, slug: g.slug }));
    }
  }
  return `// Generated from data/catalog.json — do not edit by hand.
const GENERATIONS = ${JSON.stringify(generations)};
`;
}
