import 'reflect-metadata';
import { buildCatalogConfig } from '~/platform/config/catalog.config';
import { CatalogMongoAccess } from '~/domains/product/infra/catalog/mongo/access/catalog-mongo.access';
import { verifyCatalogLocalizationCollections } from './catalog/verify-catalog-localization';

async function main() {
  const configService = {
    get<TValue extends string | undefined>(key: string, defaultValue?: TValue): TValue {
      return (process.env[key] as TValue | undefined) ?? defaultValue as TValue;
    },
  };
  const catalogConfig = buildCatalogConfig(configService);
  const catalogMongoAccess = new CatalogMongoAccess(catalogConfig);

  try {
    const report = await verifyCatalogLocalizationCollections(
      catalogMongoAccess,
      catalogConfig,
    );

    console.log(
      `Catalog localization verification: ${report.totalDocuments} documents, ` +
      `${report.staleDocuments} stale documents, ` +
      `${report.staleFields} stale language fields`,
    );

    if (report.staleFields > 0) {
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
