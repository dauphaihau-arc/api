import type { CatalogConfig } from '~/platform/config/catalog.config';
import type { CatalogMongoAccess } from './access/catalog-mongo.access';

export type CatalogMongoIndexDefinition = {
  key: Record<string, 1 | -1>;
  unique?: boolean;
};

type MongoIndexCollectionLike = {
  createIndexes(indexes: CatalogMongoIndexDefinition[]): Promise<void>;
};

export const CATALOG_PRODUCT_COLLECTION_INDEXES = [
  { key: { productId: 1 }, unique: true },
  { key: { state: 1, shopSlug: 1, slug: 1 } },

  // Category product listing by creation date.
  { key: { state: 1, categoryId: 1, 'sort.createdAt': -1 } },

  { key: { state: 1, updatedAt: -1 } },
] as const satisfies readonly CatalogMongoIndexDefinition[];

export const CATALOG_PRODUCT_PRICE_COLLECTION_INDEXES = [
  { key: { productId: 1 }, unique: true },
  { key: { updatedAt: -1 } },
] as const satisfies readonly CatalogMongoIndexDefinition[];

export const CATALOG_PRODUCT_SLUG_COLLECTION_INDEXES = [
  { key: { shopSlug: 1, productSlug: 1 }, unique: true },
  { key: { productId: 1 }, unique: true },
  { key: { shopId: 1, state: 1 } },
] as const satisfies readonly CatalogMongoIndexDefinition[];

export const CATALOG_SEARCH_COLLECTION_INDEXES = [
  { key: { productId: 1 }, unique: true },
  {
    key: {
      shopSlug: 1,
      slug: 1,
      state: 1,
      'flags.hasImages': 1,
    },
  },

  // Category browse ranking.
  {
    key: {
      state: 1,
      'flags.hasImages': 1,
      categoryId: 1,
      'ranking.popularityScore': -1,
      'ranking.createdAt': -1,
    },
  },

  // Category newest browse.
  {
    key: {
      state: 1,
      'flags.hasImages': 1,
      categoryId: 1,
      'ranking.createdAt': -1,
    },
  },

  // Filtered browse ranking for maker/digital facets.
  {
    key: {
      state: 1,
      'flags.hasImages': 1,
      whoMade: 1,
      isDigital: 1,
      'ranking.popularityScore': -1,
      'ranking.createdAt': -1,
    },
  },

  // General browse ranking.
  {
    key: {
      state: 1,
      'flags.hasImages': 1,
      'ranking.popularityScore': -1,
      'ranking.createdAt': -1,
    },
  },

  // General newest browse.
  {
    key: {
      state: 1,
      'flags.hasImages': 1,
      'ranking.createdAt': -1,
    },
  },
  { key: { state: 1, 'price.minAmountMinor': 1 } },
  { key: { state: 1, updatedAt: -1 } },
] as const satisfies readonly CatalogMongoIndexDefinition[];

export async function syncCatalogMongoIndexes(
  catalogConfig: CatalogConfig,
  catalogMongoAccess: CatalogMongoAccess,
): Promise<void> {
  await Promise.all([
    createCollectionIndexes(
      catalogMongoAccess,
      catalogConfig.mongodbProductsCollection,
      CATALOG_PRODUCT_COLLECTION_INDEXES,
    ),
    createCollectionIndexes(
      catalogMongoAccess,
      catalogConfig.mongodbPricesCollection,
      CATALOG_PRODUCT_PRICE_COLLECTION_INDEXES,
    ),
    createCollectionIndexes(
      catalogMongoAccess,
      catalogConfig.mongodbSlugsCollection,
      CATALOG_PRODUCT_SLUG_COLLECTION_INDEXES,
    ),
    createCollectionIndexes(
      catalogMongoAccess,
      catalogConfig.mongodbSearchCollection,
      CATALOG_SEARCH_COLLECTION_INDEXES,
    ),
  ]);
}

async function createCollectionIndexes(
  catalogMongoAccess: CatalogMongoAccess,
  collectionName: string,
  indexes: readonly CatalogMongoIndexDefinition[],
): Promise<void> {
  const collection = await catalogMongoAccess.getCollection<MongoIndexCollectionLike>(
    collectionName,
  );
  await collection.createIndexes([...indexes]);
}
