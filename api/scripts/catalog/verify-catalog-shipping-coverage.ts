import type { CatalogConfig } from '~/platform/config/catalog.config';
import type { CatalogMongoAccess } from '~/domains/product/infra/catalog/mongo/access/catalog-mongo.access';
import {
  verifyCatalogShippingCoverage,
  type CatalogShippingCoverageVerifiableDocument,
  type CatalogShippingCoverageVerificationReport,
} from '~/domains/product/infra/catalog/mongo/shipping-coverage-verification';

type VerificationCollectionLike = {
  find(
    filter: Record<string, never>,
    options?: Record<string, unknown>,
  ): { toArray(): Promise<CatalogShippingCoverageVerifiableDocument[]> };
};

/**
 * Verifies every catalog collection the storefront reads. Product documents
 * and search documents are projected separately, so a shipping coverage gap in
 * either collection is reported instead of hidden by the other.
 */
export async function verifyCatalogShippingCoverageCollections(
  catalogMongoAccess: CatalogMongoAccess,
  catalogConfig: CatalogConfig,
): Promise<CatalogShippingCoverageVerificationReport> {
  const documents: CatalogShippingCoverageVerifiableDocument[] = [];

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
        state: 1,
        isDigital: 1,
        shipping: 1,
      },
    }).toArray());
  }

  return verifyCatalogShippingCoverage(documents);
}
