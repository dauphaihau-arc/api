import { Inject, Injectable } from '@nestjs/common';
import { CATALOG_CONFIG, type CatalogConfig } from '~/config/catalog.config';
import { ProductRecommendationQueryRepository } from '../../../../app/ports/product-recommendation-query.repository';
import type {
  ListPublicProductsByShopSlugInput,
  PublicProductListItem,
  RecommendPublicProductsInput
} from '../../../../app/product.types';
import { compareRecommendationCandidates } from '../../../../app/services/public-product-recommendation-scoring';
import { ProductState } from '../../../../domain/enums/product-state.enum';
import { CatalogMongoAccess } from '../../../catalog/mongo/access/catalog-mongo.access';
import type { CatalogProductDocument } from '../../../catalog/mongo/documents/catalog-product-document.mapper';
import type { CatalogSearchDocument } from '../../../catalog/mongo/documents/catalog-search-document.mapper';
import { PRODUCT_STOCK_NOTICE_THRESHOLD } from '../../../../app/product-stock.constants';

type MongoAggregateCursorLike<TDocument> = {
  toArray(): Promise<TDocument[]>;
};

type MongoCollectionLike<TDocument> = {
  findOne(filter: Record<string, unknown>): Promise<TDocument | null>;
  aggregate<TResult = TDocument>(
    pipeline: Array<Record<string, unknown>>
  ): MongoAggregateCursorLike<TResult>;
};

@Injectable()
export class AtlasProductRecommendationQueryRepository
implements ProductRecommendationQueryRepository {
  constructor(
    @Inject(CATALOG_CONFIG)
    private readonly catalogConfig: CatalogConfig,
    private readonly catalogMongoAccess: CatalogMongoAccess
  ) {}

  async listPublicByShopSlug(
    input: ListPublicProductsByShopSlugInput
  ): Promise<PublicProductListItem[]> {
    const collection = await this.getProductsCollection();
    const documents = await collection.aggregate<CatalogProductDocument>([
      {
        $match: {
          state: ProductState.ACTIVE,
          shopSlug: input.shopSlug,
          ...(input.excludeProductSlug
            ? { slug: { $ne: input.excludeProductSlug } }
            : {}),
        },
      },
      {
        $sort: {
          'sort.createdAt': -1,
        },
      },
      {
        $limit: Math.max(input.limit * 3, input.limit),
      },
    ]).toArray();

    return documents
      .filter((document) => document.images.length > 0)
      .slice(0, input.limit)
      .map(toPublicProductListItemFromCatalogDocument);
  }

  async recommendSimilarPublic(
    input: RecommendPublicProductsInput
  ): Promise<PublicProductListItem[]> {
    this.assertAtlasSearchEnabled();

    const searchCollection = await this.getSearchCollection();
    const anchor = await searchCollection.findOne({
      shopSlug: input.shopSlug,
      slug: input.productSlug,
      state: ProductState.ACTIVE,
      'flags.hasImages': true,
    });

    if (!anchor) {
      return [];
    }

    const candidates = await this.findRecommendationCandidates(searchCollection, anchor, input.limit);

    return candidates
      .sort((left, right) => compareRecommendationCandidates(
        toRecommendationScorableSearchProduct(anchor),
        toRecommendationScorableSearchProduct(left),
        toRecommendationScorableSearchProduct(right)
      ))
      .slice(0, input.limit)
      .map(toPublicProductListItemFromSearchDocument);
  }

  private async getProductsCollection(): Promise<MongoCollectionLike<CatalogProductDocument>> {
    return this.catalogMongoAccess.getCollection<MongoCollectionLike<CatalogProductDocument>>(
      this.catalogConfig.mongodbProductsCollection
    );
  }

  private async getSearchCollection(): Promise<MongoCollectionLike<CatalogSearchDocument>> {
    return this.catalogMongoAccess.getCollection<MongoCollectionLike<CatalogSearchDocument>>(
      this.catalogConfig.mongodbSearchCollection
    );
  }

  private assertAtlasSearchEnabled(): void {
    if (this.catalogConfig.driver !== 'mongodb') {
      throw new Error('Atlas Search storefront repository requires mongodb catalog driver');
    }

    if (this.catalogConfig.searchDriver !== 'atlas') {
      throw new Error('Atlas Search storefront repository requires CATALOG_SEARCH_DRIVER=atlas');
    }
  }

  private async findRecommendationCandidates(
    collection: MongoCollectionLike<CatalogSearchDocument>,
    anchor: CatalogSearchDocument,
    limit: number
  ): Promise<CatalogSearchDocument[]> {
    const candidates = new Map<string, CatalogSearchDocument>();
    const targetPoolSize = Math.max(limit * 4, 24);

    if (anchor.categoryId) {
      const sameCategory = await collection.aggregate<CatalogSearchDocument>([
        {
          $match: {
            state: ProductState.ACTIVE,
            'flags.hasImages': true,
            productId: { $ne: anchor.productId },
            categoryId: anchor.categoryId,
          },
        },
        {
          $sort: {
            'ranking.popularityScore': -1,
            'ranking.createdAt': -1,
          },
        },
        {
          $limit: targetPoolSize,
        },
      ]).toArray();

      sameCategory.forEach((document) => candidates.set(document.productId, document));
    }

    if (candidates.size < targetPoolSize) {
      const relatedByShape = await collection.aggregate<CatalogSearchDocument>([
        {
          $match: {
            state: ProductState.ACTIVE,
            'flags.hasImages': true,
            productId: { $ne: anchor.productId },
            whoMade: anchor.whoMade,
            isDigital: anchor.isDigital,
          },
        },
        {
          $sort: {
            'ranking.popularityScore': -1,
            'ranking.createdAt': -1,
          },
        },
        {
          $limit: targetPoolSize,
        },
      ]).toArray();

      relatedByShape.forEach((document) => candidates.set(document.productId, document));
    }

    if (candidates.size < targetPoolSize) {
      const fallback = await collection.aggregate<CatalogSearchDocument>([
        {
          $match: {
            state: ProductState.ACTIVE,
            'flags.hasImages': true,
            productId: { $ne: anchor.productId },
          },
        },
        {
          $sort: {
            'ranking.popularityScore': -1,
            'ranking.createdAt': -1,
          },
        },
        {
          $limit: targetPoolSize,
        },
      ]).toArray();

      fallback.forEach((document) => candidates.set(document.productId, document));
    }

    return Array.from(candidates.values());
  }
}

function toFacetKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toPublicProductListItemFromSearchDocument(
  document: CatalogSearchDocument
): PublicProductListItem {
  return {
    id: document.productId,
    shop: {
      id: document.shopId,
      publicId: document.shopPublicId,
      shopName: document.shopName,
      slug: document.shopSlug,
    },
    categoryId: document.categoryId,
    title: document.title,
    slug: document.slug,
    image: document.image
      ? {
        storageKey: document.image.storageKey,
      }
      : undefined,
    variantType: document.variantType,
    pricing: {
      minAmountMinor: document.price.minAmountMinor,
      maxAmountMinor: document.price.maxAmountMinor,
      originalMinAmountMinor: document.price.originalMinAmountMinor,
      originalMaxAmountMinor: document.price.originalMaxAmountMinor,
      currency: document.price.currency,
    },
    availability: {
      inStock: document.inventory.inStock,
      lowStock: document.inventory.totalStock > 0
        && document.inventory.totalStock < PRODUCT_STOCK_NOTICE_THRESHOLD,
      stockTotal: document.inventory.totalStock,
    },
    variantCount: document.variantCount,
    createdAt: document.ranking.createdAt,
  };
}

function toPublicProductListItemFromCatalogDocument(
  document: CatalogProductDocument
): PublicProductListItem {
  const totalStock = document.inventory.reduce((sum, inventory) => sum + inventory.stock, 0);

  return {
    id: document.productId,
    shop: {
      id: document.shopId,
      publicId: document.shopPublicId,
      shopName: document.shopName,
      slug: document.shopSlug,
    },
    categoryId: document.categoryId,
    title: document.title,
    slug: document.slug,
    image: document.primaryImage,
    variantType: document.variantType,
    pricing: {
      minAmountMinor: document.sort.minPriceAmountMinor,
      maxAmountMinor: document.sort.maxPriceAmountMinor,
      currency: document.primaryInventory?.currency,
    },
    availability: {
      inStock: totalStock > 0,
      lowStock: totalStock > 0 && totalStock < PRODUCT_STOCK_NOTICE_THRESHOLD,
      stockTotal: totalStock,
    },
    variantCount: document.variantCount,
    createdAt: document.sort.createdAt,
  };
}

function toRecommendationScorableSearchProduct(document: CatalogSearchDocument) {
  return {
    id: document.productId,
    categoryId: document.categoryId,
    whoMade: document.whoMade,
    isDigital: document.isDigital,
    variantType: document.variantType,
    attributeOptionKeys: (document.attributes ?? [])
      .map((attribute) => {
        const optionKey = attribute.selectedOptionKey ?? toFacetKey(attribute.selectedOptionValue ?? '');

        return optionKey
          ? `${attribute.categoryAttributeKey}:${optionKey}`
          : '';
      })
      .filter(Boolean),
    inferredFacetKeys: (document.inferredFacets ?? [])
      .map((facet) => facet.optionKey
        ? `${facet.facetKey}:${facet.optionKey}`
        : `${facet.facetKey}:${toFacetKey(facet.value)}`)
      .filter(Boolean),
    minPriceAmountMinor: document.price.minAmountMinor,
    inStock: document.inventory.inStock,
    stockTotal: document.inventory.totalStock,
    popularityScore: document.ranking.popularityScore,
    createdAt: document.ranking.createdAt,
  };
}
