import {
  Inject,
  Injectable,
} from '@nestjs/common';
import { CATALOG_CONFIG, type CatalogConfig } from '~/platform/config/catalog.config';
import { CatalogMongoAccess } from '../access/catalog-mongo.access';
import { CatalogProductPriceDocumentRepository } from '../../../../app/ports/catalog-product-price-document.repository';
import type { CatalogProductPriceDocument } from '../documents/catalog-product-price-document.mapper';

type MongoPriceCollectionLike = {
  updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>
  ): Promise<void>;
  deleteOne(filter: Record<string, unknown>): Promise<void>;
  findOne(
    filter: Record<string, unknown>,
    options?: Record<string, unknown>
  ): Promise<CatalogProductPriceDocument | null>;
  find(
    filter: Record<string, unknown>,
    options?: Record<string, unknown>
  ): { toArray(): Promise<CatalogProductPriceDocument[]> };
  createIndexes(indexes: Array<Record<string, unknown>>): Promise<void>;
};

@Injectable()
export class MongoCatalogProductPriceDocumentRepository
implements CatalogProductPriceDocumentRepository {
  constructor(
    @Inject(CATALOG_CONFIG)
    private readonly catalogConfig: CatalogConfig,
    private readonly catalogMongoAccess: CatalogMongoAccess,
  ) {}

  async ping(): Promise<void> {
    await this.catalogMongoAccess.ping();
  }

  async upsert(document: CatalogProductPriceDocument): Promise<void> {
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

  async findByProductId(productId: string): Promise<CatalogProductPriceDocument | null> {
    const collection = await this.getCollection();
    return collection.findOne({ productId });
  }

  async findByProductIds(productIds: string[]): Promise<CatalogProductPriceDocument[]> {
    if (productIds.length === 0) {
      return [];
    }

    const collection = await this.getCollection();
    return collection.find({
      productId: { $in: productIds },
    }).toArray();
  }

  private async getCollection() {
    const collection = await this.catalogMongoAccess.getCollection<MongoPriceCollectionLike>(
      this.catalogConfig.mongodbPricesCollection,
    );

    await collection.createIndexes([
      { key: { productId: 1 }, unique: true },
      { key: { updatedAt: -1 } },
    ]);

    return collection;
  }
}
