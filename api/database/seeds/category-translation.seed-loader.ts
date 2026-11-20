import {
  STOREFRONT_LANGUAGES,
  type StorefrontLanguage,
} from '~/platform/config/marketplace.config';
import { categorySeedData, type CategorySeedNode } from './category.data';
import {
  CATEGORY_TRANSLATIONS_LOCAL_TSV_PATH,
  CATEGORY_TRANSLATIONS_TSV_PATH,
} from './product-seed-paths';
import { readOptionalTsvRows, readTsvRows } from './shared/read-tsv-rows';

export type CategoryTranslationSeed = {
  categoryPath: string[];
  language: StorefrontLanguage;
  name: string;
};

type CategoryTranslationCsvRow = {
  category_path: string;
  language: string;
  name: string;
};

/**
 * Curated Vietnamese content is expected for every shared Category. Categories
 * listed here are intentionally English-only; the seeder writes no translation
 * row and storefront reads fall back to the base category name. Keys use the
 * `A > B > C` hierarchy path.
 */
export const ENGLISH_ONLY_CATEGORY_PATHS: ReadonlySet<string> = new Set();

export function buildCategoryTranslationPathKey(categoryPath: string[]): string {
  return categoryPath.join(' > ');
}

function buildCategoryTranslationSeedKey(seed: CategoryTranslationSeed): string {
  return `${seed.language}::${buildCategoryTranslationPathKey(seed.categoryPath)}`;
}

function parseLanguage(value: string, seedKey: string): StorefrontLanguage {
  const language = value.trim().toLowerCase();

  if (!STOREFRONT_LANGUAGES.includes(language as StorefrontLanguage)) {
    throw new Error(
      `Unsupported language "${value}" for category translation seed ${seedKey}`,
    );
  }

  return language as StorefrontLanguage;
}

function parseCategoryPath(value: string, seedKey: string): string[] {
  const categoryPath = value
    .split('>')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (categoryPath.length === 0) {
    throw new Error(`Missing category_path for category translation seed ${seedKey}`);
  }

  return categoryPath;
}

function parseCategoryTranslationRow(
  row: CategoryTranslationCsvRow,
  seedKey: string,
): CategoryTranslationSeed {
  const name = row.name.trim();

  if (!name) {
    throw new Error(`Missing name for category translation seed ${seedKey}`);
  }

  return {
    categoryPath: parseCategoryPath(row.category_path, seedKey),
    language: parseLanguage(row.language, seedKey),
    name,
  };
}

function parseCategoryTranslationFile(
  rows: CategoryTranslationCsvRow[],
  sourceLabel: string,
): CategoryTranslationSeed[] {
  const seenKeys = new Set<string>();

  return rows.map((row, index) => {
    const seed = parseCategoryTranslationRow(row, `${sourceLabel} row ${index + 2}`);
    const seedKey = buildCategoryTranslationSeedKey(seed);

    if (seenKeys.has(seedKey)) {
      throw new Error(
        `Duplicate category translation for "${buildCategoryTranslationPathKey(seed.categoryPath)}" in language "${seed.language}" in ${sourceLabel}`,
      );
    }

    seenKeys.add(seedKey);
    return seed;
  });
}

/**
 * Shared rows load first and local rows second, so a local row with the same
 * `(category_path, language)` replaces the shared row.
 */
export function mergeCategoryTranslationSeeds(
  sharedSeeds: CategoryTranslationSeed[],
  localSeeds: CategoryTranslationSeed[],
): CategoryTranslationSeed[] {
  const seedsByKey = new Map<string, CategoryTranslationSeed>();

  for (const seed of sharedSeeds) {
    seedsByKey.set(buildCategoryTranslationSeedKey(seed), seed);
  }

  for (const seed of localSeeds) {
    seedsByKey.set(buildCategoryTranslationSeedKey(seed), seed);
  }

  return [...seedsByKey.values()];
}

export function readCategoryTranslationSeeds(
  sharedPath: string = CATEGORY_TRANSLATIONS_TSV_PATH,
  localPath: string = CATEGORY_TRANSLATIONS_LOCAL_TSV_PATH,
): CategoryTranslationSeed[] {
  const sharedRows = readTsvRows<CategoryTranslationCsvRow>(sharedPath);
  const localRows = readOptionalTsvRows<CategoryTranslationCsvRow>(localPath);

  return mergeCategoryTranslationSeeds(
    parseCategoryTranslationFile(sharedRows, 'category-translations.tsv'),
    parseCategoryTranslationFile(localRows, 'category-translations.local.tsv'),
  );
}

export function collectCategorySeedPaths(
  nodes: CategorySeedNode[],
  parentPath: string[] = [],
): string[][] {
  return nodes.flatMap((node) => {
    const categoryPath = [...parentPath, node.name];

    return [categoryPath, ...collectCategorySeedPaths(node.children ?? [], categoryPath)];
  });
}

/**
 * Every shared Category needs curated Vietnamese content unless it is an
 * explicit English-only exception. English-only categories intentionally have
 * no seed row; storefront reads then fall back to the base English name.
 */
export function assertCategoryTranslationCoverage(
  translations: CategoryTranslationSeed[],
  categories: CategorySeedNode[],
  exceptions: ReadonlySet<string> = ENGLISH_ONLY_CATEGORY_PATHS,
): void {
  const vietnameseCategoryPaths = new Set(
    translations
      .filter((translation) => translation.language === 'vi')
      .map((translation) => buildCategoryTranslationPathKey(translation.categoryPath)),
  );

  const allCategoryPaths = collectCategorySeedPaths(categories);
  const knownCategoryPaths = new Set(
    allCategoryPaths.map((categoryPath) =>
      buildCategoryTranslationPathKey(categoryPath),
    ),
  );

  for (const translation of translations) {
    const pathKey = buildCategoryTranslationPathKey(translation.categoryPath);

    if (!knownCategoryPaths.has(pathKey)) {
      throw new Error(
        `Category translation seed references unknown category path "${pathKey}"`,
      );
    }
  }

  for (const categoryPath of allCategoryPaths) {
    const pathKey = buildCategoryTranslationPathKey(categoryPath);

    if (exceptions.has(pathKey)) {
      continue;
    }

    if (!vietnameseCategoryPaths.has(pathKey)) {
      throw new Error(
        `Missing Vietnamese category translation for "${pathKey}". Add a vi row to seed-data/category-translations.tsv or list the category as an English-only exception.`,
      );
    }
  }
}

export function loadCategoryTranslationSeeds(): CategoryTranslationSeed[] {
  const translations = readCategoryTranslationSeeds();
  assertCategoryTranslationCoverage(translations, categorySeedData);
  return translations;
}

export const categoryTranslationSeeds: CategoryTranslationSeed[] =
  loadCategoryTranslationSeeds();
