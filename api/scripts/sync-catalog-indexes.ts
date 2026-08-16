import 'reflect-metadata';
import { buildCatalogConfig } from '~/platform/config/catalog.config';
import { CatalogMongoAccess } from '~/domains/product/infra/catalog/mongo/access/catalog-mongo.access';
import { syncCatalogMongoIndexes } from '~/domains/product/infra/catalog/mongo/catalog-mongo-indexes';

async function runWithTimeout(
  label: string,
  operation: Promise<void>,
  timeoutMs = 5_000,
): Promise<void> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      operation,
      new Promise<never>((resolveTimeout, reject) => {
        void resolveTimeout;
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

async function main(): Promise<void> {
  const configService = {
    get<TValue extends string | undefined>(key: string, defaultValue?: TValue): TValue {
      return (process.env[key] as TValue | undefined) ?? defaultValue as TValue;
    },
  };
  const catalogConfig = buildCatalogConfig(configService);
  const catalogMongoAccess = new CatalogMongoAccess(catalogConfig);

  console.log(
    `Syncing catalog MongoDB indexes -> uri=${catalogConfig.mongodbUri} db=${catalogConfig.mongodbDbName}` +
    ` products=${catalogConfig.mongodbProductsCollection}` +
    ` prices=${catalogConfig.mongodbPricesCollection}` +
    ` slugs=${catalogConfig.mongodbSlugsCollection}` +
    ` search=${catalogConfig.mongodbSearchCollection}`,
  );

  try {
    await syncCatalogMongoIndexes(catalogConfig, catalogMongoAccess);
    console.log('Catalog MongoDB indexes synced');
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
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
}).then(() => {
  process.exit(0);
});
