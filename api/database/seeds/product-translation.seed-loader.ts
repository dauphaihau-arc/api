import {
  STOREFRONT_LANGUAGES,
  type StorefrontLanguage,
} from '~/platform/config/marketplace.config';
import {
  PRODUCT_LOCAL_TSV_PATH,
  PRODUCT_TRANSLATIONS_LOCAL_TSV_PATH,
  PRODUCT_TRANSLATIONS_TSV_PATH,
  PRODUCT_TSV_PATH,
} from './product-seed-paths';
import { readOptionalTsvRows, readTsvRows } from './shared/read-tsv-rows';

export type ProductTranslationSeed = {
  shopSlug: string;
  productTitle: string;
  language: StorefrontLanguage;
  title: string;
  description: string;
};

export type SharedProductIdentity = {
  shopSlug: string;
  title: string;
  state: string;
};

type ProductTranslationCsvRow = {
  shop_slug: string;
  product_title: string;
  language: string;
  title: string;
  description: string;
};

type SharedProductCsvRow = {
  shop_slug: string;
  title: string;
  state?: string;
};

/**
 * Curated Vietnamese content is expected for every shared active Product.
 * Products listed here are intentionally English-only; the seeder writes no
 * translation row and storefront reads fall back to the base product content.
 * Keys use `<shop_slug>::<base product title>`.
 */
export const ENGLISH_ONLY_PRODUCT_KEYS: ReadonlySet<string> = new Set();

export function buildProductTranslationIdentityKey(
  shopSlug: string,
  productTitle: string,
): string {
  return `${shopSlug}::${productTitle}`;
}

function buildProductTranslationSeedKey(seed: ProductTranslationSeed): string {
  return `${seed.language}::${buildProductTranslationIdentityKey(
    seed.shopSlug,
    seed.productTitle,
  )}`;
}

function parseLanguage(value: string, seedKey: string): StorefrontLanguage {
  const language = value.trim().toLowerCase();

  if (!STOREFRONT_LANGUAGES.includes(language as StorefrontLanguage)) {
    throw new Error(
      `Unsupported language "${value}" for product translation seed ${seedKey}`,
    );
  }

  return language as StorefrontLanguage;
}

function parseProductTranslationRow(
  row: ProductTranslationCsvRow,
  seedKey: string,
): ProductTranslationSeed {
  const shopSlug = row.shop_slug.trim();
  const productTitle = row.product_title.trim();
  const title = row.title.trim();
  const description = row.description.trim();

  if (!shopSlug) {
    throw new Error(`Missing shop_slug for product translation seed ${seedKey}`);
  }

  if (!productTitle) {
    throw new Error(`Missing product_title for product translation seed ${seedKey}`);
  }

  if (!title) {
    throw new Error(`Missing title for product translation seed ${seedKey}`);
  }

  if (!description) {
    throw new Error(`Missing description for product translation seed ${seedKey}`);
  }

  return {
    shopSlug,
    productTitle,
    language: parseLanguage(row.language, seedKey),
    title,
    description,
  };
}

function parseProductTranslationFile(
  rows: ProductTranslationCsvRow[],
  sourceLabel: string,
): ProductTranslationSeed[] {
  const seenKeys = new Set<string>();

  return rows.map((row, index) => {
    const seed = parseProductTranslationRow(row, `${sourceLabel} row ${index + 2}`);
    const seedKey = buildProductTranslationSeedKey(seed);

    if (seenKeys.has(seedKey)) {
      throw new Error(
        `Duplicate product translation for "${seed.productTitle}" at "${seed.shopSlug}" in language "${seed.language}" in ${sourceLabel}`,
      );
    }

    seenKeys.add(seedKey);
    return seed;
  });
}

/**
 * Shared rows load first and local rows second, so a local row with the same
 * `(shop_slug, base product title, language)` replaces the shared row. File
 * order is preserved otherwise.
 */
export function mergeProductTranslationSeeds(
  sharedSeeds: ProductTranslationSeed[],
  localSeeds: ProductTranslationSeed[],
): ProductTranslationSeed[] {
  const seedsByKey = new Map<string, ProductTranslationSeed>();

  for (const seed of sharedSeeds) {
    seedsByKey.set(buildProductTranslationSeedKey(seed), seed);
  }

  for (const seed of localSeeds) {
    seedsByKey.set(buildProductTranslationSeedKey(seed), seed);
  }

  return [...seedsByKey.values()];
}

export function readProductTranslationSeeds(
  sharedPath: string = PRODUCT_TRANSLATIONS_TSV_PATH,
  localPath: string = PRODUCT_TRANSLATIONS_LOCAL_TSV_PATH,
): ProductTranslationSeed[] {
  const sharedRows = readTsvRows<ProductTranslationCsvRow>(sharedPath);
  const localRows = readOptionalTsvRows<ProductTranslationCsvRow>(localPath);

  return mergeProductTranslationSeeds(
    parseProductTranslationFile(sharedRows, 'product-translations.tsv'),
    parseProductTranslationFile(localRows, 'product-translations.local.tsv'),
  );
}

export function assertProductTranslationReferences(
  translations: ProductTranslationSeed[],
  knownProducts: SharedProductIdentity[],
): void {
  const knownProductKeys = new Set(
    knownProducts.map((product) =>
      buildProductTranslationIdentityKey(product.shopSlug, product.title),
    ),
  );

  for (const translation of translations) {
    const identityKey = buildProductTranslationIdentityKey(
      translation.shopSlug,
      translation.productTitle,
    );

    if (!knownProductKeys.has(identityKey)) {
      throw new Error(
        `Product translation seed references unknown product "${translation.productTitle}" at "${translation.shopSlug}"`,
      );
    }
  }
}

/**
 * Every shared active Product needs curated Vietnamese content unless it is an
 * explicit English-only exception. English-only products intentionally have no
 * seed row; storefront reads then fall back to the base English content.
 */
export function assertProductTranslationCoverage(
  translations: ProductTranslationSeed[],
  sharedProducts: SharedProductIdentity[],
  exceptions: ReadonlySet<string> = ENGLISH_ONLY_PRODUCT_KEYS,
): void {
  const vietnameseProductKeys = new Set(
    translations
      .filter((translation) => translation.language === 'vi')
      .map((translation) =>
        buildProductTranslationIdentityKey(translation.shopSlug, translation.productTitle),
      ),
  );

  for (const product of sharedProducts) {
    if (product.state !== '' && product.state !== 'active') {
      continue;
    }

    const identityKey = buildProductTranslationIdentityKey(product.shopSlug, product.title);

    if (exceptions.has(identityKey)) {
      continue;
    }

    if (!vietnameseProductKeys.has(identityKey)) {
      throw new Error(
        `Missing Vietnamese product translation for "${product.title}" at "${product.shopSlug}". Add a vi row to seed-data/product-translations.tsv or list the product as an English-only exception.`,
      );
    }
  }
}

export function loadProductTranslationSeeds(): ProductTranslationSeed[] {
  const translations = readProductTranslationSeeds();
  const sharedProducts = readTsvRows<SharedProductCsvRow>(PRODUCT_TSV_PATH).map((row) => ({
    shopSlug: row.shop_slug.trim(),
    title: row.title.trim(),
    state: row.state?.trim() ?? '',
  }));
  const localProducts = readOptionalTsvRows<SharedProductCsvRow>(
    PRODUCT_LOCAL_TSV_PATH,
  ).map((row) => ({
    shopSlug: row.shop_slug.trim(),
    title: row.title.trim(),
    state: row.state?.trim() ?? '',
  }));

  assertProductTranslationReferences(translations, [...sharedProducts, ...localProducts]);
  assertProductTranslationCoverage(translations, sharedProducts);
  return translations;
}

export const productTranslationSeeds: ProductTranslationSeed[] =
  loadProductTranslationSeeds();
