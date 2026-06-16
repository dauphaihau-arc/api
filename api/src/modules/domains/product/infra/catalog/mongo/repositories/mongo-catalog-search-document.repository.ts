import {
  Inject,
  Injectable
} from '@nestjs/common';
import { CATALOG_CONFIG, type CatalogConfig } from '~/config/catalog.config';
import { CatalogSearchDocumentRepository } from '../app/ports/catalog-search-document.repository';
import { CatalogMongoAccess } from './catalog/mongo/access/catalog-mongo.access';
import type { CatalogSearchDocument } from './catalog/mongo/documents/catalog-search-document.mapper';

type MongoSearchCollectionLike = {
  updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>
  ): Promise<void>;
  deleteOne(filter: Record<string, unknown>): Promise<void>;
  createIndexes(indexes: Array<Record<string, unknown>>): Promise<void>;
};

@Injectable()
export class MongoCatalogSearchDocumentRepository
implements CatalogSearchDocumentRepository {
  constructor(
    @Inject(CATALOG_CONFIG)
    private readonly catalogConfig: CatalogConfig,
    private readonly catalogMongoAccess: CatalogMongoAccess
  ) {}

  async ping(): Promise<void> {
    await this.catalogMongoAccess.ping();
  }

  async upsert(document: CatalogSearchDocument): Promise<void> {
    if (!this.catalogMongoAccess.isEnabled()) {
      return;
    }

    const collection = await this.getCollection();
    await collection.updateOne(
      { productId: document.productId },
      { $set: document },
      { upsert: true }
    );
  }

  async deleteByProductId(productId: string): Promise<void> {
    if (!this.catalogMongoAccess.isEnabled()) {
      return;
    }

    const collection = await this.getCollection();
    await collection.deleteOne({ productId });
  }

  private async getCollection() {
    const collection = await this.catalogMongoAccess.getCollection<MongoSearchCollectionLike>(
      this.catalogConfig.mongodbSearchCollection
    );

    await collection.createIndexes([
      { key: { productId: 1 }, unique: true },
      { key: { state: 1, categoryId: 1, 'ranking.createdAt': -1 } },
      { key: { state: 1, isDigital: 1, whoMade: 1 } },
      { key: { state: 1, 'price.minAmountMinor': 1 } },
      { key: { state: 1, updatedAt: -1 } },
    ]);

    return collection;
  }
}
