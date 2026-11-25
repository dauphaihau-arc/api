import 'reflect-metadata';
import { buildCatalogConfig } from '~/platform/config/catalog.config';
import { CatalogMongoAccess } from '~/domains/product/infra/catalog/mongo/access/catalog-mongo.access';
import { verifyCatalogShippingCoverageCollections } from './catalog/verify-catalog-shipping-coverage';

async function main() {
  const configService = {
    get<TValue extends string | undefined>(key: string, defaultValue?: TValue): TValue {
      return (process.env[key] as TValue | undefined) ?? defaultValue as TValue;
    },
  };
  const catalogConfig = buildCatalogConfig(configService);
  const catalogMongoAccess = new CatalogMongoAccess(catalogConfig);

  try {
    const report = await verifyCatalogShippingCoverageCollections(
      catalogMongoAccess,
      catalogConfig,
    );

    console.log(
      `Catalog shipping coverage verification: ${report.totalDocuments} documents, ` +
      `${report.invalidDocuments} invalid documents`,
    );

    if (report.invalidDocuments > 0) {
      console.error(JSON.stringify(report.issues.slice(0, 20), null, 2));
      process.exitCode = 1;
    }
  }
  finally {
    await catalogMongoAccess.onApplicationShutdown();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
