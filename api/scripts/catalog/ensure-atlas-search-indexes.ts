import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CatalogConfig } from '~/platform/config/catalog.config';
import type { CatalogMongoAccess } from '~/domains/product/infra/catalog/mongo/access/catalog-mongo.access';

type SearchIndexDocument = {
  name?: string;
};

type SearchIndexDefinition = {
  name: string;
  type: 'search';
  definition: Record<string, unknown>;
};

type SearchIndexFile = {
  name: string;
  definition: Record<string, unknown>;
};

type SearchIndexCursorLike = {
  toArray(): Promise<SearchIndexDocument[]>;
};

type MongoSearchIndexCollectionLike = {
  listSearchIndexes(): SearchIndexCursorLike;
  createSearchIndexes(indexes: SearchIndexDefinition[]): Promise<string[]>;
};

const ATLAS_SEARCH_INDEX_FILES = [
  'product_search.index.json',
  'product_suggestions.index.json',
] as const;

const ATLAS_SEARCH_INDEX_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'infra',
  'atlas-search',
);

export async function ensureAtlasSearchIndexes(
  catalogConfig: CatalogConfig,
  catalogMongoAccess: CatalogMongoAccess,
): Promise<void> {
  const collection = await catalogMongoAccess.getCollection<MongoSearchIndexCollectionLike>(
    catalogConfig.mongodbSearchCollection,
  );
  const expectedIndexes = await loadAtlasSearchIndexes();

  let existingIndexNames: Set<string>;

  try {
    const existingIndexes = await collection.listSearchIndexes().toArray();
    existingIndexNames = new Set(
      existingIndexes
        .map((index) => index.name)
        .filter((name): name is string => typeof name === 'string'),
    );
  }
  catch (error) {
    if (isSearchIndexCommandUnsupportedError(error)) {
      console.warn(
        `Skipping Atlas Search index setup: ${getErrorMessage(error)}`,
      );
      return;
    }

    throw error;
  }

  const missingIndexes = expectedIndexes.filter(
    (index) => !existingIndexNames.has(index.name),
  );

  if (missingIndexes.length === 0) {
    console.log('Atlas Search indexes already exist');
    return;
  }

  try {
    const createdIndexNames = await collection.createSearchIndexes(missingIndexes);
    console.log(
      `Created Atlas Search indexes: ${createdIndexNames.join(', ')}`,
    );
  }
  catch (error) {
    if (isSearchIndexAlreadyExistsError(error)) {
      console.warn(
        `Atlas Search index already exists while creating missing indexes: ${getErrorMessage(error)}`,
      );
      return;
    }

    if (isSearchIndexCommandUnsupportedError(error)) {
      console.warn(
        `Skipping Atlas Search index setup: ${getErrorMessage(error)}`,
      );
      return;
    }

    throw error;
  }
}

async function loadAtlasSearchIndexes(): Promise<SearchIndexDefinition[]> {
  const files = await Promise.all(
    ATLAS_SEARCH_INDEX_FILES.map(async (fileName) => {
      const contents = await readFile(
        path.join(ATLAS_SEARCH_INDEX_DIR, fileName),
        'utf8',
      );

      return JSON.parse(contents) as SearchIndexFile;
    }),
  );

  return files.map((file) => ({
    name: file.name,
    type: 'search',
    definition: file.definition,
  }));
}

function isSearchIndexCommandUnsupportedError(error: unknown): boolean {
  const code = getMongoErrorCode(error);
  const codeName = getMongoErrorCodeName(error);
  const message = getErrorMessage(error).toLowerCase();

  return code === 59
    || codeName === 'CommandNotFound'
    || message.includes('no such command')
    || message.includes('not supported')
    || message.includes('unsupported')
    || message.includes('requires atlas')
    || message.includes('search index commands are only supported');
}

function isSearchIndexAlreadyExistsError(error: unknown): boolean {
  const code = getMongoErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();

  return code === 68
    || message.includes('already exists')
    || message.includes('duplicate');
}

function getMongoErrorCode(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? Number((error as { code?: unknown }).code)
    : undefined;
}

function getMongoErrorCodeName(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'codeName' in error
    ? String((error as { codeName?: unknown }).codeName)
    : undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
