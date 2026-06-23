import { Inject, Injectable } from '@nestjs/common';
import { CATALOG_CONFIG, type CatalogConfig } from '~/config/catalog.config';
import {
  STOREFRONT_PRICING_CONFIG,
  type StorefrontPricingConfig,
} from '~/config/storefront-pricing.config';
import { ProductRecommendationQueryRepository } from '../../../../app/ports/product-recommendation-query.repository';
import { CatalogProductPriceDocumentRepository } from '../../../../app/ports/catalog-product-price-document.repository';
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
import type { CatalogProductDocument } from '../../../catalog/mongo/documents/catalog-product-document.mapper';
import type { CatalogProductPriceDocument } from '../../../catalog/mongo/documents/catalog-product-price-document.mapper';
import type { CatalogSearchDocument } from '../../../catalog/mongo/documents/catalog-search-document.mapper';
import { PRODUCT_STOCK_NOTICE_THRESHOLD } from '../../../../app/product-stock.constants';
import { MikroOrmProductRecommendationQueryRepository } from '../../../persistence/mikro-orm/repositories/mikro-orm-product-recommendation-query.repository';
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
    private readonly catalogProductPriceDocumentRepository: CatalogProductPriceDocumentRepository,
    private readonly catalogMongoAccess: CatalogMongoAccess,
    private readonly storefrontMarketContextService: StorefrontMarketContextService,
    private readonly mikroOrmProductRecommendationQueryRepository: MikroOrmProductRecommendationQueryRepository,
  ) {}

  async listPublicByShopSlug(
    input: ListPublicProductsByShopSlugInput,
  ): Promise<PublicProductListItem[]> {
    const pricingSelection = resolveIndexedPricingSelection(
      await this.storefrontMarketContextService.resolveCurrentRequest(),
    );
    if (!isIndexedPricingSelection(this.storefrontPricingConfig, pricingSelection)) {
      return this.mikroOrmProductRecommendationQueryRepository.listPublicByShopSlug(input);
    }
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
    const priceDocumentByProductId = new Map(
      (await this.catalogProductPriceDocumentRepository.findByProductIds(
        documents.map((document) => document.productId),
      )).map((document) => [document.productId, document] as const),
    );

    return documents
      .filter((document) => document.images.length > 0)
      .slice(0, input.limit)
      .map((document) => toPublicProductListItemFromCatalogDocument(
        document,
        priceDocumentByProductId.get(document.productId),
        pricingSelection,
      ));
  }

  async recommendSimilarPublic(
    input: RecommendPublicProductsInput,
  ): Promise<PublicProductListItem[]> {
    this.assertAtlasSearchEnabled();
    const pricingSelection = resolveIndexedPricingSelection(
      await this.storefrontMarketContextService.resolveCurrentRequest(),
    );
    if (!isIndexedPricingSelection(this.storefrontPricingConfig, pricingSelection)) {
      return this.mikroOrmProductRecommendationQueryRepository.recommendSimilarPublic(input);
    }

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
        toRecommendationScorableSearchProduct(anchor, pricingSelection),
        toRecommendationScorableSearchProduct(left, pricingSelection),
        toRecommendationScorableSearchProduct(right, pricingSelection),
      ))
      .slice(0, input.limit)
      .map((document) => toPublicProductListItemFromSearchDocument(document, pricingSelection));
  }

  private async getProductsCollection(): Promise<MongoCollectionLike<CatalogProductDocument>> {
    return this.catalogMongoAccess.getCollection<MongoCollectionLike<CatalogProductDocument>>(
      this.catalogConfig.mongodbProductsCollection,
    );
  }

  private async getSearchCollection(): Promise<MongoCollectionLike<CatalogSearchDocument>> {
    const collection = await this.catalogMongoAccess.getCollection<MongoCollectionLike<CatalogSearchDocument>>(
      this.catalogConfig.mongodbSearchCollection,
    );

    await this.ensureSearchCollectionIndexes(collection);

    return collection;
  }

  private assertAtlasSearchEnabled(): void {
    if (this.catalogConfig.driver !== 'mongodb') {
      throw new Error('Atlas Search storefront repository requires mongodb catalog driver');
    }

    if (this.catalogConfig.searchDriver !== 'atlas') {
      throw new Error('Atlas Search storefront repository requires CATALOG_SEARCH_DRIVER=atlas');
    }
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

function toPublicProductListItemFromCatalogDocument(
  document: CatalogProductDocument,
  priceDocument?: CatalogProductPriceDocument | null,
  pricingSelection?: StorefrontIndexedPricingSelection,
): PublicProductListItem {
  const totalStock = document.inventory.reduce((sum, inventory) => sum + inventory.stock, 0);
  const indexedPricing = getIndexedPriceSummary(priceDocument?.summaryByMarket, pricingSelection);

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
      minAmountMinor: indexedPricing?.minAmountMinor,
      maxAmountMinor: indexedPricing?.maxAmountMinor,
      originalMinAmountMinor: indexedPricing?.originalMinAmountMinor,
      originalMaxAmountMinor: indexedPricing?.originalMaxAmountMinor,
      currency: indexedPricing?.currency,
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
