import type { CatalogConfig } from '~/platform/config/catalog.config';
import type { CatalogMongoAccess } from '~/domains/product/infra/catalog/mongo/access/catalog-mongo.access';
import {
  verifyCatalogLocalizedContent,
  type CatalogLocalizationVerifiableDocument,
  type CatalogLocalizationVerificationReport,
} from '~/domains/product/infra/catalog/mongo/localized-content-verification';

type VerificationCollectionLike = {
  find(
    filter: Record<string, never>,
    options?: Record<string, unknown>,
  ): { toArray(): Promise<CatalogLocalizationVerifiableDocument[]> };
};

/**
 * Verifies every catalog collection the storefront reads. Product documents
 * and search documents are projected separately, so a failed search upsert
 * must not pass because the product collection is healthy.
 */
export async function verifyCatalogLocalizationCollections(
  catalogMongoAccess: CatalogMongoAccess,
  catalogConfig: CatalogConfig,
): Promise<CatalogLocalizationVerificationReport> {
  const documents: CatalogLocalizationVerifiableDocument[] = [];

  for (const collectionName of [
    catalogConfig.mongodbProductsCollection,
    catalogConfig.mongodbSearchCollection,
  ]) {
    const collection = await catalogMongoAccess.getCollection<VerificationCollectionLike>(
      collectionName,
    );
    documents.push(...await collection.find({}, {
      projection: {
        productId: 1,
        title: 1,
        description: 1,
        localized: 1,
      },
    }).toArray());
  }

  return verifyCatalogLocalizedContent(documents);
}
