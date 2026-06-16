import {
  Inject,
  Injectable,
  Logger
} from '@nestjs/common';
import { CATALOG_CONFIG, type CatalogConfig } from '~/config/catalog.config';
import {
  type CatalogProductDocumentStats,
  CatalogProductDocumentRepository
} from '../../../../app/ports/catalog-product-document.repository';
import { ProductState } from '../../../../domain/enums/product-state.enum';
import { CatalogMongoAccess } from '../access/catalog-mongo.access';
import type { CatalogProductDocument } from '../documents/catalog-product-document.mapper';

type MongoProductCollectionLike = {
  updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>
  ): Promise<void>;
  deleteOne(filter: Record<string, unknown>): Promise<void>;
  countDocuments(filter?: Record<string, unknown>): Promise<number>;
  findOne(
    filter: Record<string, unknown>,
    options?: Record<string, unknown>
  ): Promise<CatalogProductDocument | null>;
  createIndexes(indexes: Array<Record<string, unknown>>): Promise<void>;
};

type UpdatedAtDocument = {
  updatedAt?: Date;
};

@Injectable()
export class MongoCatalogProductDocumentRepository
implements CatalogProductDocumentRepository {
  private readonly logger = new Logger(MongoCatalogProductDocumentRepository.name);

  constructor(
    @Inject(CATALOG_CONFIG)
    private readonly catalogConfig: CatalogConfig,
    private readonly catalogMongoAccess: CatalogMongoAccess
  ) {
  }

  async ping(): Promise<void> {
    await this.catalogMongoAccess.ping();
  }

  async getStats(): Promise<CatalogProductDocumentStats | null> {
    if (!this.catalogMongoAccess.isEnabled()) {
      return null;
    }

    try {
      const collection = await this.getCollection();
      const [totalDocuments, activeDocuments, latestDocument] = await Promise.all([
        collection.countDocuments({}),
        collection.countDocuments({ state: ProductState.ACTIVE }),
        collection.findOne(
          {},
          {
            projection: { updatedAt: 1 },
            sort: { updatedAt: -1 },
          }
        ) as Promise<UpdatedAtDocument | null>,
      ]);

      return {
        totalDocuments,
        activeDocuments,
        latestUpdatedAt: latestDocument?.updatedAt,
      };
    }
    catch (error) {
      this.logger.warn(
        `Unable to load catalog document stats: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return null;
    }
  }

  async upsert(document: CatalogProductDocument): Promise<void> {
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
    const collection = await this.catalogMongoAccess.getCollection<MongoProductCollectionLike>(
      this.catalogConfig.mongodbProductsCollection
    );

    await collection.createIndexes([
      { key: { productId: 1 }, unique: true },
      { key: { state: 1, shopSlug: 1, slug: 1 } },
      { key: { state: 1, categoryId: 1, 'sort.createdAt': -1 } },
      { key: { state: 1, categoryId: 1, 'sort.minPriceAmountMinor': 1 } },
      { key: { state: 1, updatedAt: -1 } },
    ]);

    return collection;
  }
}
