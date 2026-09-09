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
import { compareRecommendationCandidates } from '../../../../app/services/public-product-recommendation-scoring';
import type {
  ListPublicProductsByShopSlugInput,
  PublicProductListItem,
  RecommendPublicProductsInput,
} from '../../../../app/product.types';
import { PRODUCT_STOCK_NOTICE_THRESHOLD } from '../../../../app/product-stock.constants';
import { ProductState } from '../../../../domain/enums/product-state.enum';
import { CatalogMongoAccess } from '../../../catalog/mongo/access/catalog-mongo.access';
import type { CatalogSearchDocument } from '../../../catalog/mongo/documents/catalog-search-document.mapper';

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
export class MongoBasicProductRecommendationQueryRepository
implements ProductRecommendationQueryRepository {
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
    const pricingSelection = this.toIndexedPricingSelection(resolveIndexedPricingSelection(
      await this.storefrontMarketContextService.resolveCurrentRequest(),
    ));
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
      pricingSelection,
    ));
  }

  async recommendSimilarPublic(
    input: RecommendPublicProductsInput,
  ): Promise<PublicProductListItem[]> {
    const pricingSelection = this.toIndexedPricingSelection(resolveIndexedPricingSelection(
      await this.storefrontMarketContextService.resolveCurrentRequest(),
    ));
    const collection = await this.getSearchCollection();
    const anchor = await collection.findOne({
      shopSlug: input.shopSlug,
      slug: input.productSlug,
      state: ProductState.ACTIVE,
      'flags.hasImages': true,
    });

    if (!anchor) {
      return [];
    }

    const candidates = await this.findRecommendationCandidates(collection, anchor, input.limit);

    return candidates
      .sort((left, right) => compareRecommendationCandidates(
        toRecommendationScorableSearchProduct(anchor, pricingSelection),
        toRecommendationScorableSearchProduct(left, pricingSelection),
        toRecommendationScorableSearchProduct(right, pricingSelection),
      ))
      .slice(0, input.limit)
      .map((document) => toPublicProductListItemFromSearchDocument(document, pricingSelection));
  }

  private async getSearchCollection(): Promise<MongoCollectionLike<CatalogSearchDocument>> {
    return this.catalogMongoAccess.getCollection<MongoCollectionLike<CatalogSearchDocument>>(
      this.catalogConfig.mongodbSearchCollection,
    );
  }

  private toIndexedPricingSelection(
    pricingSelection: StorefrontIndexedPricingSelection | undefined,
  ): StorefrontIndexedPricingSelection | undefined {
    return isIndexedPricingSelection(this.storefrontPricingConfig, pricingSelection)
      ? pricingSelection
      : undefined;
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
        url: document.image.url,
      }
      : undefined,
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

function toFacetKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
