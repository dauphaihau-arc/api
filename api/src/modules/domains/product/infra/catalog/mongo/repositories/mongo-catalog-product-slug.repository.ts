import {
  Inject,
  Injectable,
} from '@nestjs/common';
import { CATALOG_CONFIG, type CatalogConfig } from '~/config/catalog.config';
import {
  type CatalogProductSlugDocument,
  CatalogProductSlugRepository,
} from '../../../../app/ports/catalog-product-slug.repository';
import { ProductState } from '../../../../domain/enums/product-state.enum';
import { CatalogMongoAccess } from '../access/catalog-mongo.access';

type MongoSlugCollectionLike<TDocument> = {
  updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>
  ): Promise<void>;
  deleteOne(filter: Record<string, unknown>): Promise<void>;
  findOne(
    filter: Record<string, unknown>,
    options?: Record<string, unknown>
  ): Promise<TDocument | null>;
  createIndexes(indexes: Array<Record<string, unknown>>): Promise<void>;
};

type ExistingSlugDocument = Pick<CatalogProductSlugDocument, '_id'>;

@Injectable()
export class MongoCatalogProductSlugRepository
implements CatalogProductSlugRepository {
  constructor(
    @Inject(CATALOG_CONFIG)
    private readonly catalogConfig: CatalogConfig,
    private readonly catalogMongoAccess: CatalogMongoAccess,
  ) {}

  async ping(): Promise<void> {
    await this.catalogMongoAccess.ping();
  }

  async findProductIdByShopAndSlug(
    shopSlug: string,
    productSlug: string,
  ): Promise<string | null> {
    const collection = await this.getCollection();
    const document = await collection.findOne(
      {
        shopSlug,
        productSlug,
        state: {
          // Accept legacy uppercase projections until the catalog is backfilled.
          $in: [ProductState.ACTIVE, 'ACTIVE'],
        },
      },
      {
        projection: { productId: 1 },
      },
    );

    return document?.productId ?? null;
  }

  async upsert(document: CatalogProductSlugDocument): Promise<void> {
    if (!this.catalogMongoAccess.isEnabled()) {
      return;
    }

    const collection = await this.getCollection();

    const existingDocument = await collection.findOne(
      { productId: document.productId },
      { projection: { _id: 1 } },
    ) as ExistingSlugDocument | null;

    if (existingDocument && existingDocument._id !== document._id) {
      await collection.deleteOne({ _id: existingDocument._id });
    }

    await collection.updateOne(
      { _id: document._id },
      { $set: document },
      { upsert: true },
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
    const collection = await this.catalogMongoAccess.getCollection<MongoSlugCollectionLike<CatalogProductSlugDocument>>(
      this.catalogConfig.mongodbSlugsCollection,
    );

    await collection.createIndexes([
      { key: { shopSlug: 1, productSlug: 1 }, unique: true },
      { key: { productId: 1 }, unique: true },
      { key: { shopId: 1, state: 1 } },
    ]);

    return collection;
  }
}
