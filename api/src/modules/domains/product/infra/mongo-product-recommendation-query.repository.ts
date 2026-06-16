import { Inject, Injectable } from '@nestjs/common';
import { CATALOG_CONFIG, type CatalogConfig } from '~/config/catalog.config';
import { FxRateService } from '~/modules/shared/currency/fx-rate.service';
import { RoundingPolicyService } from '~/modules/shared/currency/rounding-policy.service';
import { ProductRecommendationQueryRepository } from '../app/ports/product-recommendation-query.repository';
import type {
  ListPublicProductsByShopSlugInput,
  PublicProductListItem,
  RecommendPublicProductsInput
} from '../app/product.types';
import { compareRecommendationCandidates } from '../app/services/public-product-recommendation-scoring';
import { StorefrontMarketContextService } from '../app/services/storefront-market-context.service';
import { ProductState } from '../domain/enums/product-state.enum';
import { ProductShippingCharge } from '../domain/enums/product-shipping-charge.enum';
import { CatalogMongoAccess } from './catalog-mongo.access';
import type { CatalogProductDocument } from './catalog-product-document.mapper';
import { PRODUCT_STOCK_NOTICE_THRESHOLD } from '../app/product-stock.constants';

type MongoCollectionLike<TDocument> = {
  find(
    filter: Record<string, unknown>,
    options?: { projection?: Record<string, number> }
  ): {
    sort(sort: Record<string, 1 | -1>): MongoCollectionLikeCursor<TDocument>;
    skip(value: number): MongoCollectionLikeCursor<TDocument>;
    limit(value: number): MongoCollectionLikeCursor<TDocument>;
    toArray(): Promise<TDocument[]>;
  };
  findOne(filter: Record<string, unknown>): Promise<TDocument | null>;
};

type MongoCollectionLikeCursor<TDocument> = {
  sort(sort: Record<string, 1 | -1>): MongoCollectionLikeCursor<TDocument>;
  skip(value: number): MongoCollectionLikeCursor<TDocument>;
  limit(value: number): MongoCollectionLikeCursor<TDocument>;
  toArray(): Promise<TDocument[]>;
};

@Injectable()
export class MongoProductRecommendationQueryRepository
implements ProductRecommendationQueryRepository {
  constructor(
    @Inject(CATALOG_CONFIG)
    private readonly catalogConfig: CatalogConfig,
    private readonly catalogMongoAccess: CatalogMongoAccess,
    private readonly storefrontMarketContextService: StorefrontMarketContextService,
    private readonly fxRateService: FxRateService,
    private readonly roundingPolicyService: RoundingPolicyService
  ) {}

  async listPublicByShopSlug(
    input: ListPublicProductsByShopSlugInput
  ): Promise<PublicProductListItem[]> {
    const collection = await this.getCollection();
    const documents = await collection.find({
      state: ProductState.ACTIVE,
      shopSlug: input.shopSlug,
      ...(input.excludeProductSlug
        ? { slug: { $ne: input.excludeProductSlug } }
        : {}),
    })
      .sort({ 'sort.createdAt': -1 })
      .limit(Math.max(input.limit * 3, input.limit))
      .toArray();

    const visibleDocuments = documents
      .filter((document) => this.shouldIncludeInPublicList(document))
      .slice(0, input.limit);

    return Promise.all(visibleDocuments.map((document) => this.toPublicProductListItem(document)));
  }

  async recommendSimilarPublic(
    input: RecommendPublicProductsInput
  ): Promise<PublicProductListItem[]> {
    const collection = await this.getCollection();
    const anchor = await collection.findOne({
      shopSlug: input.shopSlug,
      slug: input.productSlug,
      state: ProductState.ACTIVE,
    });

    if (!anchor || !this.shouldIncludeInPublicList(anchor)) {
      return [];
    }

    const candidates = await this.findRecommendationCandidates(collection, anchor, input.limit);

    const orderedCandidates = candidates
      .filter((document) => this.shouldIncludeInPublicList(document))
      .sort((left, right) => compareRecommendationCandidates(
        toRecommendationScorableProduct(anchor),
        toRecommendationScorableProduct(left),
        toRecommendationScorableProduct(right)
      ))
      .slice(0, input.limit);

    return Promise.all(orderedCandidates.map((document) => this.toPublicProductListItem(document)));
  }

  private shouldIncludeInPublicList(document: CatalogProductDocument): boolean {
    return document.state === ProductState.ACTIVE && document.images.length > 0;
  }

  private async toPublicProductListItem(
    document: CatalogProductDocument
  ): Promise<PublicProductListItem> {
    const resolvedInventory = await Promise.all(
      document.inventory.map((inventory) => this.resolveCatalogInventoryPricing(inventory))
    );
    const priceSummary = summarizeResolvedCatalogPricing(resolvedInventory);
    const stockTotal = resolvedInventory.reduce((sum, inventory) => sum + inventory.stock, 0);

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
      pricing: priceSummary,
      availability: {
        inStock: stockTotal > 0,
        lowStock: stockTotal > 0 && stockTotal < PRODUCT_STOCK_NOTICE_THRESHOLD,
        stockTotal,
      },
      variantCount: document.variantCount,
      hasFreeShipping: document.shipping?.destinations.some(
        (destination) => destination.chargeType === ProductShippingCharge.FREE_SHIPPING
      ),
      createdAt: document.sort.createdAt,
    };
  }

  private async getCollection(): Promise<MongoCollectionLike<CatalogProductDocument>> {
    if (this.catalogConfig.driver !== 'mongodb') {
      throw new Error('Mongo storefront repository is not enabled');
    }

    return this.catalogMongoAccess.getCollection<MongoCollectionLike<CatalogProductDocument>>(
      this.catalogConfig.mongodbProductsCollection
    );
  }

  private async resolveCatalogInventoryPricing(input: {
    id: string;
    productVariantId?: string;
    sku?: string;
    stock: number;
    amountMinor?: number;
    originalAmountMinor?: number;
    currency?: string;
  }) {
    const basePricing = {
      id: input.id,
      productVariantId: input.productVariantId,
      sku: input.sku,
      stock: input.stock,
      amountMinor: input.amountMinor,
      originalAmountMinor: input.originalAmountMinor,
      currency: input.currency,
    };
    const context = await this.storefrontMarketContextService.resolveCurrentRequest();

    if (
      !context?.currency
      || !basePricing.currency
      || basePricing.amountMinor == null
      || context.currency === basePricing.currency
    ) {
      return basePricing;
    }

    const rate = await this.fxRateService.getLatestRate({
      fromCurrency: basePricing.currency,
      toCurrency: context.currency,
    });

    if (!rate) {
      return basePricing;
    }

    const amountMajor = toMajorUnits(basePricing.amountMinor, basePricing.currency) * Number(rate.rate);
    const originalAmountMajor = basePricing.originalAmountMinor != null
      ? toMajorUnits(basePricing.originalAmountMinor, basePricing.currency) * Number(rate.rate)
      : undefined;

    return {
      ...basePricing,
      amountMinor: this.roundingPolicyService.toMinorUnits(amountMajor, context.currency),
      originalAmountMinor: originalAmountMajor != null
        ? this.roundingPolicyService.toMinorUnits(originalAmountMajor, context.currency)
        : undefined,
      currency: context.currency,
    };
  }

  private async findRecommendationCandidates(
    collection: MongoCollectionLike<CatalogProductDocument>,
    anchor: CatalogProductDocument,
    limit: number
  ): Promise<CatalogProductDocument[]> {
    const candidates = new Map<string, CatalogProductDocument>();
    const targetPoolSize = Math.max(limit * 4, 24);

    if (anchor.categoryId) {
      const sameCategory = await collection.find({
        state: ProductState.ACTIVE,
        productId: { $ne: anchor.productId },
        categoryId: anchor.categoryId,
      }).limit(targetPoolSize).toArray();

      sameCategory.forEach((document) => candidates.set(document.productId, document));
    }

    if (candidates.size < targetPoolSize) {
      const relatedByShape = await collection.find({
        state: ProductState.ACTIVE,
        productId: { $ne: anchor.productId },
        whoMade: anchor.whoMade,
        isDigital: anchor.isDigital,
      }).limit(targetPoolSize).toArray();

      relatedByShape.forEach((document) => candidates.set(document.productId, document));
    }

    if (candidates.size < targetPoolSize) {
      const fallback = await collection.find({
        state: ProductState.ACTIVE,
        productId: { $ne: anchor.productId },
      }).limit(targetPoolSize).toArray();

      fallback.forEach((document) => candidates.set(document.productId, document));
    }

    return Array.from(candidates.values());
  }
}

function toMajorUnits(amountMinor: number, currency: string): number {
  return amountMinor / (currency === 'JPY' || currency === 'KRW' || currency === 'VND' ? 1 : 100);
}

function summarizeResolvedCatalogPricing(pricingRows: Array<{
  amountMinor?: number;
  originalAmountMinor?: number;
  currency?: string;
}>): PublicProductListItem['pricing'] {
  const amountValues = pricingRows
    .map((pricing) => pricing.amountMinor)
    .filter((value): value is number => value != null);
  const originalAmountValues = pricingRows
    .map((pricing) => pricing.originalAmountMinor)
    .filter((value): value is number => value != null);

  if (amountValues.length === 0 && originalAmountValues.length === 0 && !pricingRows[0]?.currency) {
    return undefined;
  }

  return {
    ...(amountValues.length > 0 ? { minAmountMinor: Math.min(...amountValues) } : {}),
    ...(amountValues.length > 0 ? { maxAmountMinor: Math.max(...amountValues) } : {}),
    ...(originalAmountValues.length > 0
      ? { originalMinAmountMinor: Math.min(...originalAmountValues) }
      : {}),
    ...(originalAmountValues.length > 0
      ? { originalMaxAmountMinor: Math.max(...originalAmountValues) }
      : {}),
    currency: pricingRows.find((pricing) => pricing.currency)?.currency,
  };
}

function toFacetKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toRecommendationScorableProduct(document: CatalogProductDocument) {
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
    minPriceAmountMinor: document.sort.minPriceAmountMinor,
    inStock: document.sort.inStock,
    stockTotal: document.inventory.reduce((sum, inventory) => sum + inventory.stock, 0),
    popularityScore: document.sort.popularityScore,
    createdAt: document.sort.createdAt,
  };
}
