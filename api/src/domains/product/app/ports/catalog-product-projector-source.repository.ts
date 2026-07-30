import type { toCatalogProductDocument } from '../../infra/catalog/mongo/documents/catalog-product-document.mapper';

export type CatalogProjectableProduct = Parameters<typeof toCatalogProductDocument>[0];

export abstract class CatalogProductProjectorSourceRepository {
  abstract findById(productId: string): Promise<CatalogProjectableProduct | null>;
}
