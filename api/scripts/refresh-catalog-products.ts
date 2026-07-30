import 'reflect-metadata';
import { MikroORM } from '@mikro-orm/postgresql';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import { buildStorageConfig } from '~/platform/config/storage.config';
import { buildCatalogConfig } from '~/platform/config/catalog.config';
import { buildStorefrontPricingConfig } from '~/platform/config/storefront-pricing.config';
import { CatalogProductProjectorService } from '~/domains/product/app/services/catalog-product-projector.service';
import { CatalogMongoAccess } from '~/domains/product/infra/catalog/mongo/access/catalog-mongo.access';
import { MongoCatalogProductDocumentRepository } from '~/domains/product/infra/catalog/mongo/repositories/mongo-catalog-product-document.repository';
import { MongoCatalogProductPriceDocumentRepository } from '~/domains/product/infra/catalog/mongo/repositories/mongo-catalog-product-price-document.repository';
import { MongoCatalogSearchDocumentRepository } from '~/domains/product/infra/catalog/mongo/repositories/mongo-catalog-search-document.repository';
import { MongoCatalogProductSlugRepository } from '~/domains/product/infra/catalog/mongo/repositories/mongo-catalog-product-slug.repository';
import { MikroOrmCatalogProductProjectorSourceRepository } from '~/domains/product/infra/persistence/mikro-orm/repositories/mikro-orm-catalog-product-projector-source.repository';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { LocalFileStorageService } from '~/integrations/storage/infra/local-file-storage.service';
import { MinioStorageService } from '~/integrations/storage/infra/minio-storage.service';
import { ProductState } from '~/domains/product/domain/enums/product-state.enum';
import type { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { FxRateService } from '~/integrations/currency/fx-rate.service';
import { RoundingPolicyService } from '~/integrations/currency/rounding-policy.service';
import { StorefrontIndexedPriceProjectionService } from '~/domains/product/app/services/storefront-indexed-price-projection.service';

type MongoDeleteManyCollectionLike = {
  deleteMany(filter: Record<string, never>): Promise<{ deletedCount?: number }>;
};

async function runWithTimeout(
  label: string,
  operation: Promise<void>,
  timeoutMs = 5_000,
): Promise<void> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  }
  finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function main() {
  console.log('Starting catalog backfill');
  const orm = await MikroORM.init({
    ...buildDatabaseConfig(process.env, {
      includeEntityGlobs: true,
    }),
  });

  const configService = {
    get<TValue extends string | undefined>(key: string, defaultValue?: TValue): TValue {
      return (process.env[key] as TValue | undefined) ?? defaultValue as TValue;
    },
  };

  const catalogConfig = buildCatalogConfig(configService);
  const storefrontPricingConfig = buildStorefrontPricingConfig(configService);

  if (catalogConfig.driver !== 'mongodb') {
    throw new Error(
      'CATALOG_STORE_DRIVER must be mongodb to run catalog backfill',
    );
  }

  console.log(
    `Catalog target -> driver=${catalogConfig.driver} uri=${catalogConfig.mongodbUri} db=${catalogConfig.mongodbDbName} products=${catalogConfig.mongodbProductsCollection} prices=${catalogConfig.mongodbPricesCollection} slugs=${catalogConfig.mongodbSlugsCollection}`,
  );

  const storageConfig = buildStorageConfig(configService);
  const storageService: StorageService = storageConfig.driver === 'minio'
    ? new MinioStorageService(storageConfig)
    : new LocalFileStorageService(storageConfig);
  const catalogMongoAccess = new CatalogMongoAccess(catalogConfig);
  const catalogRepository = new MongoCatalogProductDocumentRepository(
    catalogConfig,
    catalogMongoAccess,
  );
  const catalogPriceRepository = new MongoCatalogProductPriceDocumentRepository(
    catalogConfig,
    catalogMongoAccess,
  );
  const catalogSearchRepository = new MongoCatalogSearchDocumentRepository(
    catalogConfig,
    catalogMongoAccess,
  );
  const catalogSlugRepository = new MongoCatalogProductSlugRepository(
    catalogConfig,
    catalogMongoAccess,
  );
  const catalogProjectorSourceRepository = new MikroOrmCatalogProductProjectorSourceRepository(
    orm.em,
  );
  const storefrontIndexedPriceProjectionService = new StorefrontIndexedPriceProjectionService(
    storefrontPricingConfig,
    new FxRateService(orm.em),
    new RoundingPolicyService(),
  );
  const projector = new CatalogProductProjectorService(
    catalogProjectorSourceRepository,
    storageService,
    catalogConfig,
    catalogRepository,
    catalogPriceRepository,
    catalogSlugRepository,
    catalogSearchRepository,
    storefrontIndexedPriceProjectionService,
  );

  try {
    console.log('Checking MongoDB connectivity');
    await Promise.all([
      catalogRepository.ping(),
      catalogPriceRepository.ping(),
      catalogSlugRepository.ping(),
      catalogSearchRepository.ping(),
    ]);
    console.log('MongoDB connectivity OK');

    console.log('Clearing existing catalog projection collections');
    const [
      productsDeleteResult,
      pricesDeleteResult,
      slugsDeleteResult,
      searchDeleteResult,
    ] = await Promise.all([
      catalogMongoAccess.getCollection<MongoDeleteManyCollectionLike>(
        catalogConfig.mongodbProductsCollection,
      ).then((collection) => collection.deleteMany({})),
      catalogMongoAccess.getCollection<MongoDeleteManyCollectionLike>(
        catalogConfig.mongodbPricesCollection,
      ).then((collection) => collection.deleteMany({})),
      catalogMongoAccess.getCollection<MongoDeleteManyCollectionLike>(
        catalogConfig.mongodbSlugsCollection,
      ).then((collection) => collection.deleteMany({})),
      catalogMongoAccess.getCollection<MongoDeleteManyCollectionLike>(
        catalogConfig.mongodbSearchCollection,
      ).then((collection) => collection.deleteMany({})),
    ]);
    console.log(
      'Cleared catalog collections:' +
      ` products=${productsDeleteResult.deletedCount ?? 0}` +
      ` prices=${pricesDeleteResult.deletedCount ?? 0}` +
      ` slugs=${slugsDeleteResult.deletedCount ?? 0}` +
      ` search=${searchDeleteResult.deletedCount ?? 0}`,
    );

    const productIds = await orm.em.fork().find(
      ProductEntity,
      { state: ProductState.ACTIVE },
      {
        fields: ['id'],
        orderBy: { createdAt: 'asc' },
      },
    );

    console.log(`Found ${productIds.length} active products in PostgreSQL`);

    let processed = 0;

    for (const [index, product] of productIds.entries()) {
      try {
        console.log(`Projecting ${index + 1}/${productIds.length} -> ${product.id}`);
        await projector.projectProduct(product.id);
        processed += 1;
      }
      catch (error) {
        console.error(`Failed projecting product ${product.id}`);
        throw error;
      }
    }

    console.log(
      `Catalog backfill completed: projected ${processed}/${productIds.length} active products`,
    );
  }
  finally {
    console.log('Closing catalog MongoDB connection');
    try {
      await runWithTimeout(
        'Catalog MongoDB shutdown',
        catalogMongoAccess.onApplicationShutdown(),
      );
      console.log('Catalog MongoDB connection closed');
    }
    catch (error) {
      console.warn(
        `Catalog MongoDB shutdown did not finish cleanly: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    console.log('Closing PostgreSQL connection');
    try {
      await runWithTimeout('PostgreSQL shutdown', orm.close(true));
      console.log('PostgreSQL connection closed');
    }
    catch (error) {
      console.warn(
        `PostgreSQL shutdown did not finish cleanly: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
}).then(() => {
  console.log('Catalog backfill shutdown complete');
  process.exit(0);
});
