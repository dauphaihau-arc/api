import {
  Inject,
  Injectable,
} from '@nestjs/common';
import { CATALOG_CONFIG, type CatalogConfig } from '~/platform/config/catalog.config';
import { CatalogSearchDocumentRepository } from '../../../../app/ports/catalog-search-document.repository';
import { CatalogMongoAccess } from '../access/catalog-mongo.access';
import type { CatalogSearchDocument } from '../documents/catalog-search-document.mapper';

type MongoSearchCollectionLike = {
  updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>
  ): Promise<void>;
  deleteOne(filter: Record<string, unknown>): Promise<void>;
};

@Injectable()
export class MongoCatalogSearchDocumentRepository
implements CatalogSearchDocumentRepository {
  constructor(
    @Inject(CATALOG_CONFIG)
    private readonly catalogConfig: CatalogConfig,
    private readonly catalogMongoAccess: CatalogMongoAccess,
  ) {}

  async ping(): Promise<void> {
    await this.catalogMongoAccess.ping();
  }

  async upsert(document: CatalogSearchDocument): Promise<void> {
    const collection = await this.getCollection();
    await collection.updateOne(
      { productId: document.productId },
      { $set: document },
      { upsert: true },
    );
  }

  async deleteByProductId(productId: string): Promise<void> {
    const collection = await this.getCollection();
    await collection.deleteOne({ productId });
  }

  private async getCollection() {
    return this.catalogMongoAccess.getCollection<MongoSearchCollectionLike>(
      this.catalogConfig.mongodbSearchCollection,
    );
  }
}
