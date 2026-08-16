import type { CatalogConfig } from '~/platform/config/catalog.config';
import {
  CATALOG_PRODUCT_COLLECTION_INDEXES,
  CATALOG_PRODUCT_PRICE_COLLECTION_INDEXES,
  CATALOG_PRODUCT_SLUG_COLLECTION_INDEXES,
  CATALOG_SEARCH_COLLECTION_INDEXES,
  syncCatalogMongoIndexes,
} from './catalog-mongo-indexes';

describe('syncCatalogMongoIndexes', () => {
  it('keeps direct public browse indexes aligned with storefront sort patterns', () => {
    expect(CATALOG_SEARCH_COLLECTION_INDEXES).toEqual(
      expect.arrayContaining([
        {
          key: {
            state: 1,
            'flags.hasImages': 1,
            'ranking.createdAt': -1,
          },
        },
        {
          key: {
            state: 1,
            'flags.hasImages': 1,
            categoryId: 1,
            'ranking.createdAt': -1,
          },
        },
      ]),
    );
  });

  it('creates indexes for every catalog MongoDB collection', async () => {
    const createIndexesByCollection = new Map<string, jest.Mock>();
    const getCollection = jest.fn(async (collectionName: string) => {
      const createIndexes = jest.fn(async () => undefined);
      createIndexesByCollection.set(collectionName, createIndexes);

      return { createIndexes };
    });

    await syncCatalogMongoIndexes(
      {
        mongodbProductsCollection: 'catalog_products',
        mongodbPricesCollection: 'catalog_product_prices',
        mongodbSlugsCollection: 'catalog_product_slugs',
        mongodbSearchCollection: 'catalog_product_search',
      } as CatalogConfig,
      { getCollection } as never,
    );

    expect(getCollection).toHaveBeenCalledTimes(4);
    expect(createIndexesByCollection.get('catalog_products')).toHaveBeenCalledWith([
      ...CATALOG_PRODUCT_COLLECTION_INDEXES,
    ]);
    expect(createIndexesByCollection.get('catalog_product_prices')).toHaveBeenCalledWith([
      ...CATALOG_PRODUCT_PRICE_COLLECTION_INDEXES,
    ]);
    expect(createIndexesByCollection.get('catalog_product_slugs')).toHaveBeenCalledWith([
      ...CATALOG_PRODUCT_SLUG_COLLECTION_INDEXES,
    ]);
    expect(createIndexesByCollection.get('catalog_product_search')).toHaveBeenCalledWith([
      ...CATALOG_SEARCH_COLLECTION_INDEXES,
    ]);
  });
});
