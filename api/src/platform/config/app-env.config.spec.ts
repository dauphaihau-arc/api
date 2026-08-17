import { validateAppEnv } from './app-env.config';

describe('validateAppEnv', () => {
  it('accepts the mongo-basic catalog search driver for local development', () => {
    expect(() => validateAppEnv({
      DB_HOST: '127.0.0.1',
      DB_USER: 'postgres',
      DB_PASSWORD: 'postgres',
      DB_NAME: 'app',
      JWT_ACCESS_SECRET: 'access-secret',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_SECRET: 'refresh-secret',
      JWT_REFRESH_TTL: '7d',
      CATALOG_STORE_DRIVER: 'mongodb',
      CATALOG_SEARCH_DRIVER: 'mongo-basic',
      CATALOG_MONGODB_URI: 'mongodb://127.0.0.1:27017',
      CATALOG_MONGODB_DB_NAME: 'arc_catalog',
      CATALOG_MONGODB_PRODUCTS_COLLECTION: 'catalog_products',
      CATALOG_MONGODB_PRICES_COLLECTION: 'catalog_product_prices',
      CATALOG_MONGODB_SLUGS_COLLECTION: 'catalog_product_slugs',
      CATALOG_MONGODB_SEARCH_COLLECTION: 'catalog_product_search',
    })).not.toThrow();
  });
});
