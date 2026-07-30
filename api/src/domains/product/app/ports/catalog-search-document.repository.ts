import type { CatalogSearchDocument } from '../../infra/catalog/mongo/documents/catalog-search-document.mapper';

export abstract class CatalogSearchDocumentRepository {
  abstract ping(): Promise<void>;

  abstract upsert(document: CatalogSearchDocument): Promise<void>;

  abstract deleteByProductId(productId: string): Promise<void>;
}
