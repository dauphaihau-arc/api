import type { CatalogProductPriceDocument } from '../../infra/catalog/mongo/documents/catalog-product-price-document.mapper';

export abstract class CatalogProductPriceDocumentRepository {
  abstract ping(): Promise<void>;

  abstract upsert(document: CatalogProductPriceDocument): Promise<void>;

  abstract deleteByProductId(productId: string): Promise<void>;

  abstract findByProductId(productId: string): Promise<CatalogProductPriceDocument | null>;

  abstract findByProductIds(productIds: string[]): Promise<CatalogProductPriceDocument[]>;
}
