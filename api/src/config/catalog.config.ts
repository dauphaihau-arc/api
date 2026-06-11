import type { ConfigService } from '@nestjs/config';

export interface CatalogConfig {
  driver: 'postgres' | 'mongodb';
  searchDriver: 'mongodb' | 'atlas';
  mongodbUri: string;
  mongodbDbName: string;
  mongodbProductsCollection: string;
  mongodbSlugsCollection: string;
  mongodbSearchCollection: string;
}

export const CATALOG_CONFIG = Symbol('CATALOG_CONFIG');

export function buildCatalogConfig(
  configService: Pick<ConfigService, 'get'>
): CatalogConfig {
  return {
    driver: configService.get<'postgres' | 'mongodb'>(
      'CATALOG_STORE_DRIVER',
      'postgres'
    ),
    searchDriver: configService.get<'mongodb' | 'atlas'>(
      'CATALOG_SEARCH_DRIVER',
      'mongodb'
    ),
    mongodbUri: configService.get<string>(
      'CATALOG_MONGODB_URI',
      'mongodb://127.0.0.1:27017'
    ),
    mongodbDbName: configService.get<string>(
      'CATALOG_MONGODB_DB_NAME',
      'arc_catalog'
    ),
    mongodbProductsCollection: configService.get<string>(
      'CATALOG_MONGODB_PRODUCTS_COLLECTION',
      'catalog_products'
    ),
    mongodbSlugsCollection: configService.get<string>(
      'CATALOG_MONGODB_SLUGS_COLLECTION',
      'catalog_product_slugs'
    ),
    mongodbSearchCollection: configService.get<string>(
      'CATALOG_MONGODB_SEARCH_COLLECTION',
      'catalog_product_search'
    ),
  };
}
