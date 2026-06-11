import type { CatalogProductDocument } from '../../infra/catalog-product-document.mapper';

export interface CatalogProductDocumentStats {
  totalDocuments: number;
  activeDocuments: number;
  latestUpdatedAt?: Date;
}

export abstract class CatalogProductDocumentRepository {
  abstract ping(): Promise<void>;

  abstract getStats(): Promise<CatalogProductDocumentStats | null>;

  abstract upsert(document: CatalogProductDocument): Promise<void>;

  abstract deleteByProductId(productId: string): Promise<void>;
}
