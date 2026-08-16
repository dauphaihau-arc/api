import { Inject, Injectable } from '@nestjs/common';
import { CATALOG_CONFIG, type CatalogConfig } from '~/platform/config/catalog.config';
import {
  STOREFRONT_PRICING_CONFIG,
  type StorefrontPricingConfig,
} from '~/platform/config/storefront-pricing.config';
import { ProductRecommendationQueryRepository } from '../../../../app/ports/product-recommendation-query.repository';
import {
  getIndexedPriceSummary,
  isIndexedPricingSelection,
  resolveIndexedPricingSelection,
  type StorefrontIndexedPricingSelection,
} from '../../../../app/storefront-indexed-pricing';
import { StorefrontMarketContextService } from '../../../../app/services/storefront-market-context.service';
import type {
  ListPublicProductsByShopSlugInput,
  PublicProductListItem,
  RecommendPublicProductsInput,
} from '../../../../app/product.types';
import { compareRecommendationCandidates } from '../../../../app/services/public-product-recommendation-scoring';
import { ProductState } from '../../../../domain/enums/product-state.enum';
import { CatalogMongoAccess } from '../../../catalog/mongo/access/catalog-mongo.access';
import type { CatalogSearchDocument } from '../../../catalog/mongo/documents/catalog-search-document.mapper';
import { PRODUCT_STOCK_NOTICE_THRESHOLD } from '../../../../app/product-stock.constants';
import { CATALOG_SEARCH_COLLECTION_INDEXES } from '../../../catalog/mongo/repositories/mongo-catalog-search-document.repository';

type MongoAggregateCursorLike<TDocument> = {
  toArray(): Promise<TDocument[]>;
};

type MongoCollectionLike<TDocument> = {
  findOne(filter: Record<string, unknown>): Promise<TDocument | null>;
  aggregate<TResult = TDocument>(
    pipeline: Array<Record<string, unknown>>
  ): MongoAggregateCursorLike<TResult>;
  createIndexes?(indexes: Array<Record<string, unknown>>): Promise<void>;
};

@Injectable()
export class AtlasProductRecommendationQueryRepository
implements ProductRecommendationQueryRepository {
  private searchCollectionIndexesPromise?: Promise<void>;

  constructor(
    @Inject(CATALOG_CONFIG)
    private readonly catalogConfig: CatalogConfig,
    @Inject(STOREFRONT_PRICING_CONFIG)
    private readonly storefrontPricingConfig: StorefrontPricingConfig,
    private readonly catalogMongoAccess: CatalogMongoAccess,
    private readonly storefrontMarketContextService: StorefrontMarketContextService,
  ) {}

  async listPublicByShopSlug(
    input: ListPublicProductsByShopSlugInput,
  ): Promise<PublicProductListItem[]> {
    const pricingSelection = resolveIndexedPricingSelection(
      await this.storefrontMarketContextService.resolveCurrentRequest(),
    );

    const indexedPricingSelection = this.toIndexedPricingSelection(pricingSelection);
    const collection = await this.getSearchCollection();

    const documents = await collection.aggregate<CatalogSearchDocument>([
      {
        $match: {
          state: ProductState.ACTIVE,
          'flags.hasImages': true,
          shopSlug: input.shopSlug,
          ...(input.excludeProductSlug
            ? { slug: { $ne: input.excludeProductSlug } }
            : {}),
        },
      },
      {
        $sort: {
          'ranking.createdAt': -1,
        },
      },
      {
        $limit: input.limit,
      },
    ]).toArray();

    return documents.map((document) => toPublicProductListItemFromSearchDocument(
      document,
      indexedPricingSelection,
    ));
  }

  async recommendSimilarPublic(
    input: RecommendPublicProductsInput,
  ): Promise<PublicProductListItem[]> {
    this.assertAtlasSearchEnabled();
    const pricingSelection = resolveIndexedPricingSelection(
      await this.storefrontMarketContextService.resolveCurrentRequest(),
    );
    const indexedPricingSelection = this.toIndexedPricingSelection(pricingSelection);

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
        toRecommendationScorableSearchProduct(anchor, indexedPricingSelection),
        toRecommendationScorableSearchProduct(left, indexedPricingSelection),
        toRecommendationScorableSearchProduct(right, indexedPricingSelection),
      ))
      .slice(0, input.limit)
      .map((document) => toPublicProductListItemFromSearchDocument(document, indexedPricingSelection));
  }

  private async getSearchCollection(): Promise<MongoCollectionLike<CatalogSearchDocument>> {
    const collection = await this.catalogMongoAccess.getCollection<MongoCollectionLike<CatalogSearchDocument>>(
      this.catalogConfig.mongodbSearchCollection,
    );

    await this.ensureSearchCollectionIndexes(collection);

    return collection;
  }

  private assertAtlasSearchEnabled(): void {
    if (this.catalogConfig.searchDriver !== 'atlas') {
      throw new Error('Atlas Search storefront repository requires CATALOG_SEARCH_DRIVER=atlas');
    }
  }

  private toIndexedPricingSelection(
    pricingSelection: StorefrontIndexedPricingSelection | undefined,
  ): StorefrontIndexedPricingSelection | undefined {
    return isIndexedPricingSelection(this.storefrontPricingConfig, pricingSelection)
      ? pricingSelection
      : undefined;
  }

  private async ensureSearchCollectionIndexes(
    collection: MongoCollectionLike<CatalogSearchDocument>,
  ): Promise<void> {
    if (!collection.createIndexes) {
      return;
    }

    this.searchCollectionIndexesPromise ??= collection.createIndexes([
      ...CATALOG_SEARCH_COLLECTION_INDEXES,
    ]);

    await this.searchCollectionIndexesPromise;
  }

  private async findRecommendationCandidates(
    collection: MongoCollectionLike<CatalogSearchDocument>,
    anchor: CatalogSearchDocument,
    limit: number,
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
  document: CatalogSearchDocument,
  pricingSelection?: StorefrontIndexedPricingSelection,
): PublicProductListItem {
  const indexedPricing = getIndexedPriceSummary(document.pricingByMarket, pricingSelection);

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
      minAmountMinor: indexedPricing?.minAmountMinor ?? document.price.minAmountMinor,
      maxAmountMinor: indexedPricing?.maxAmountMinor ?? document.price.maxAmountMinor,
      originalMinAmountMinor: indexedPricing?.originalMinAmountMinor ?? document.price.originalMinAmountMinor,
      originalMaxAmountMinor: indexedPricing?.originalMaxAmountMinor ?? document.price.originalMaxAmountMinor,
      currency: indexedPricing?.currency ?? document.price.currency,
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

function toRecommendationScorableSearchProduct(
  document: CatalogSearchDocument,
  pricingSelection?: StorefrontIndexedPricingSelection,
) {
  const indexedPricing = getIndexedPriceSummary(document.pricingByMarket, pricingSelection);

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
    minPriceAmountMinor: indexedPricing?.minAmountMinor ?? document.price.minAmountMinor,
    inStock: document.inventory.inStock,
    stockTotal: document.inventory.totalStock,
    popularityScore: document.ranking.popularityScore,
    createdAt: document.ranking.createdAt,
  };
}
