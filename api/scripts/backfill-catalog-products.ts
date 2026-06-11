import 'reflect-metadata';
import { MikroORM } from '@mikro-orm/postgresql';
import { buildDatabaseConfig } from '../src/config/database.config';
import { buildStorageConfig } from '../src/config/storage.config';
import { buildCatalogConfig } from '../src/config/catalog.config';
import { CatalogProductProjectorService } from '../src/modules/domains/product/app/services/catalog-product-projector.service';
import { CatalogMongoAccess } from '../src/modules/domains/product/infra/catalog-mongo.access';
import { MongoCatalogProductDocumentRepository } from '../src/modules/domains/product/infra/mongo-catalog-product-document.repository';
import { MongoCatalogSearchDocumentRepository } from '../src/modules/domains/product/infra/mongo-catalog-search-document.repository';
import { MongoCatalogProductSlugRepository } from '../src/modules/domains/product/infra/mongo-catalog-product-slug.repository';
import { ProductEntity } from '../src/modules/domains/product/infra/persistence/entities/product.entity';
import { LocalFileStorageService } from '../src/modules/shared/storage/infra/local-file-storage.service';
import { MinioStorageService } from '../src/modules/shared/storage/infra/minio-storage.service';
import { ProductState } from '../src/modules/domains/product/domain/enums/product-state.enum';
import type { StorageService } from '../src/modules/shared/storage/app/ports/storage.service';

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

  if (catalogConfig.driver !== 'mongodb') {
    throw new Error(
      'CATALOG_STORE_DRIVER must be mongodb to run catalog backfill'
    );
  }

  console.log(
    `Catalog target -> driver=${catalogConfig.driver} uri=${catalogConfig.mongodbUri} db=${catalogConfig.mongodbDbName} products=${catalogConfig.mongodbProductsCollection} slugs=${catalogConfig.mongodbSlugsCollection}`
  );

  const storageConfig = buildStorageConfig(configService);
  const storageService: StorageService = storageConfig.driver === 'minio'
    ? new MinioStorageService(storageConfig)
    : new LocalFileStorageService(storageConfig);
  const catalogMongoAccess = new CatalogMongoAccess(catalogConfig);
  const catalogRepository = new MongoCatalogProductDocumentRepository(
    catalogConfig,
    catalogMongoAccess
  );
  const catalogSearchRepository = new MongoCatalogSearchDocumentRepository(
    catalogConfig,
    catalogMongoAccess
  );
  const catalogSlugRepository = new MongoCatalogProductSlugRepository(
    catalogConfig,
    catalogMongoAccess
  );
  const projector = new CatalogProductProjectorService(
    orm.em,
    storageService,
    catalogConfig,
    catalogRepository,
    catalogSlugRepository,
    catalogSearchRepository
  );

  try {
    console.log('Checking MongoDB connectivity');
    await Promise.all([
      catalogRepository.ping(),
      catalogSlugRepository.ping(),
      catalogSearchRepository.ping(),
    ]);
    console.log('MongoDB connectivity OK');

    const productIds = await orm.em.fork().find(
      ProductEntity,
      { state: ProductState.ACTIVE },
      {
        fields: ['id'],
        orderBy: { createdAt: 'asc' },
      }
    );

    console.log(`Found ${productIds.length} active products in PostgreSQL`);

    let processed = 0;

    for (const [index, product] of productIds.entries()) {
      try {
        console.log(`Projecting ${index + 1}/${productIds.length} -> ${product.id}`);
        await projector.projectProduct(product.id);
        processed += 1;
      } catch (error) {
        console.error(`Failed projecting product ${product.id}`);
        throw error;
      }
    }

    console.log(
      `Catalog backfill completed: projected ${processed}/${productIds.length} active products`
    );
  } finally {
    await catalogMongoAccess.onApplicationShutdown();
    await orm.close(true);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
