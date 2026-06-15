import { Inject, Injectable } from '@nestjs/common';
import { buildPaginationMeta } from '~/common/application/pagination';
import { CATALOG_CONFIG, type CatalogConfig } from '~/config/catalog.config';
import { FxRateService } from '~/modules/shared/currency/fx-rate.service';
import { RoundingPolicyService } from '~/modules/shared/currency/rounding-policy.service';
import { ProductState } from '../domain/enums/product-state.enum';
import { ProductShippingCharge } from '../domain/enums/product-shipping-charge.enum';
import { StorefrontMarketContextService } from '../app/services/storefront-market-context.service';
import { toCanonicalFacetOption } from '../app/shoe-size-groups';
import { CatalogProductSlugRepository } from '../app/ports/catalog-product-slug.repository';
import { StorefrontProductQueryRepository } from '../app/ports/storefront-product-query.repository';
import { CatalogMongoAccess } from './catalog-mongo.access';
import type {
  ListPublicProductsInput,
  PublicProductFacet,
  PublicProductDetail,
  PublicProductListItem,
  PublicProductListResult,
  PublicProductSuggestion,
  SuggestPublicProductsInput
} from '../app/product.types';
import { PUBLIC_PRODUCT_FACET_PRIORITY } from '../app/product-facet.constants';
import type { CatalogProductDocument } from './catalog-product-document.mapper';
import { isInferredFacetSupported } from './inferred-facets';
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
  countDocuments(filter: Record<string, unknown>): Promise<number>;
};

type MongoCollectionLikeCursor<TDocument> = {
  sort(sort: Record<string, 1 | -1>): MongoCollectionLikeCursor<TDocument>;
  skip(value: number): MongoCollectionLikeCursor<TDocument>;
  limit(value: number): MongoCollectionLikeCursor<TDocument>;
  toArray(): Promise<TDocument[]>;
};

@Injectable()
export class MongoStorefrontProductQueryRepository
implements StorefrontProductQueryRepository {
  constructor(
    @Inject(CATALOG_CONFIG)
    private readonly catalogConfig: CatalogConfig,
    private readonly catalogProductSlugRepository: CatalogProductSlugRepository,
    private readonly catalogMongoAccess: CatalogMongoAccess,
    private readonly storefrontMarketContextService: StorefrontMarketContextService,
    private readonly fxRateService: FxRateService,
    private readonly roundingPolicyService: RoundingPolicyService
  ) {}

  async findPublicByShopSlugAndProductSlug(
    shopSlug: string,
    productSlug: string
  ): Promise<PublicProductDetail | null> {
    const productId = await this.catalogProductSlugRepository.findProductIdByShopAndSlug(
      shopSlug,
      productSlug
    );

    if (!productId) {
      return null;
    }

    const collection = await this.getCollection();
    const document = await collection.findOne({
      productId,
      state: ProductState.ACTIVE,
    });

    return document ? this.toPublicProductDetail(document) : null;
  }

  async listPublic(
    input: ListPublicProductsInput
  ): Promise<PublicProductListResult> {
    const collection = await this.getCollection();
    const shouldResolvePriceInMemory = this.shouldResolvePriceInMemory(input);
    const filter = this.buildListFilter(input, {
      includePriceConstraints: !shouldResolvePriceInMemory,
    });

    if (shouldResolvePriceInMemory) {
      const documents = await collection.find(filter).toArray();
      const matchingItems = await Promise.all(
        documents
          .filter((document) => this.shouldIncludeInPublicList(document))
          .map((document) => this.toPublicProductListItem(document))
      );
      const filteredItems = matchingItems
        .filter((item) => this.matchesResolvedPrice(item, input))
        .sort((left, right) => compareResolvedListItems(left, right, input.order));
      const total = filteredItems.length;

      return {
        items: filteredItems.slice((input.page - 1) * input.limit, input.page * input.limit),
        meta: buildPaginationMeta(input.page, input.limit, total),
      };
    }

    const total = await collection.countDocuments(filter);

    if (total === 0) {
      return {
        items: [],
        meta: buildPaginationMeta(input.page, input.limit, 0),
      };
    }

    const documents = await collection.find(filter)
      .sort(this.buildListSort(input.order))
      .skip((input.page - 1) * input.limit)
      .limit(input.limit)
      .toArray();

    const items = await Promise.all(
      documents
        .filter((document) => this.shouldIncludeInPublicList(document))
        .map((document) => this.toPublicProductListItem(document))
    );

    return {
      items,
      meta: buildPaginationMeta(input.page, input.limit, total),
    };
  }

  async listPublicFacets(
    input: ListPublicProductsInput
  ): Promise<PublicProductFacet[]> {
    const collection = await this.getCollection();
    const filter = this.buildListFilter(input, {
      includePriceConstraints: !this.shouldResolvePriceInMemory(input),
    });
    const documents = await collection.find(filter).toArray();
    const visibleDocuments = this.shouldResolvePriceInMemory(input)
      ? await this.filterDocumentsByResolvedPrice(documents, input)
      : documents.filter((document) => this.shouldIncludeInPublicList(document));

    return buildFacetResult(visibleDocuments);
  }

  async suggestPublic(
    input: SuggestPublicProductsInput
  ): Promise<PublicProductSuggestion[]> {
    const normalizedSearch = input.search.trim().toLowerCase();

    if (!normalizedSearch) {
      return [];
    }

    const collection = await this.getCollection();
    const containsPattern = escapeRegex(normalizedSearch);
    const documents = await collection.find({
      state: ProductState.ACTIVE,
      $or: [
        { titleNormalized: { $regex: containsPattern } },
        { descriptionNormalized: { $regex: containsPattern } },
        { 'search.suggest': { $elemMatch: { $regex: `^${containsPattern}` } } },
      ],
    }).limit(input.limit * 3).toArray();

    return documents
      .sort((left, right) => compareSuggestionDocuments(left, right, normalizedSearch))
      .slice(0, input.limit)
      .map((document) => ({
        id: document.productId,
        title: document.title,
        slug: document.slug,
        shop: {
          id: document.shopId,
          publicId: document.shopPublicId,
          shopName: document.shopName,
          slug: document.shopSlug,
        },
      }));
  }

  private buildListFilter(
    input: ListPublicProductsInput,
    options?: { includePriceConstraints?: boolean }
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = {
      state: ProductState.ACTIVE,
    };
    const andFilters: Record<string, unknown>[] = [];

    if (input.categoryIds?.length) {
      andFilters.push({
        categoryId: { $in: input.categoryIds },
      });
    }

    if (input.isDigital !== undefined) {
      andFilters.push({ isDigital: input.isDigital });
    }

    if (input.whoMade) {
      andFilters.push({ whoMade: input.whoMade });
    }

    if (options?.includePriceConstraints !== false && input.minPriceMinor !== undefined) {
      andFilters.push({
        'sort.minPriceAmountMinor': { $gte: input.minPriceMinor },
      });
    }

    if (options?.includePriceConstraints !== false && input.maxPriceMinor !== undefined) {
      andFilters.push({
        'sort.minPriceAmountMinor': { $lte: input.maxPriceMinor },
      });
    }

    if (input.attributeFilters?.length) {
      for (const attributeFilter of input.attributeFilters) {
        const structuredFilter = {
          attributes: {
            $elemMatch: {
              ...(attributeFilter.attributeId
                ? { categoryAttributeKey: attributeFilter.attributeId }
                : { categoryAttributeName: attributeFilter.attributeName }),
              ...(attributeFilter.selectedOptionIds?.length
                ? { selectedOptionId: { $in: attributeFilter.selectedOptionIds } }
                : attributeFilter.selectedOptionKeys?.length
                  ? { selectedOptionKey: { $in: attributeFilter.selectedOptionKeys } }
                  : { selectedOptionValue: { $in: attributeFilter.selectedOptionValues } }),
            },
          },
        };

        if (attributeFilter.attributeId && isInferredFacetSupported(attributeFilter.attributeId)) {
          andFilters.push({
            $or: [
              structuredFilter,
              {
                inferredFacets: {
                  $elemMatch: {
                    facetKey: attributeFilter.attributeId,
                    ...(attributeFilter.selectedOptionKeys?.length
                      ? { optionKey: { $in: attributeFilter.selectedOptionKeys } }
                      : { value: { $in: attributeFilter.selectedOptionValues } }),
                  },
                },
              },
            ],
          });
          continue;
        }

        andFilters.push({
          ...structuredFilter,
        });
      }
    }

    if (input.search?.trim()) {
      const pattern = escapeRegex(input.search.trim().toLowerCase());
      andFilters.push({
        $or: [
          { titleNormalized: { $regex: pattern } },
          { descriptionNormalized: { $regex: pattern } },
          { 'search.keywords': input.search.trim().toLowerCase() },
        ],
      });
    }

    if (input.title?.trim()) {
      andFilters.push({
        titleNormalized: { $regex: escapeRegex(input.title.trim().toLowerCase()) },
      });
    }

    if (andFilters.length > 0) {
      filter.$and = andFilters;
    }

    return filter;
  }

  private buildListSort(
    order?: ListPublicProductsInput['order']
  ): Record<string, 1 | -1> {
    if (order === 'price_asc') {
      return {
        'sort.minPriceAmountMinor': 1,
        'sort.createdAt': -1,
      };
    }

    if (order === 'price_desc') {
      return {
        'sort.minPriceAmountMinor': -1,
        'sort.createdAt': -1,
      };
    }

    return {
      'sort.createdAt': -1,
    };
  }

  private shouldResolvePriceInMemory(input: ListPublicProductsInput): boolean {
    return input.minPriceMinor !== undefined
      || input.maxPriceMinor !== undefined
      || input.order === 'price_asc'
      || input.order === 'price_desc';
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

  private async toPublicProductDetail(
    document: CatalogProductDocument
  ): Promise<PublicProductDetail> {
    const variantsById = new Map(
      document.variants.map((variant) => [variant.id, variant] as const)
    );

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
      description: document.description,
      whoMade: document.whoMade,
      isDigital: document.isDigital,
      variantType: document.variantType,
      variantGroupName: document.variantGroupName,
      variantSubGroupName: document.variantSubGroupName,
      stockNoticeThreshold: PRODUCT_STOCK_NOTICE_THRESHOLD,
      images: document.images.map((image) => ({
        id: image.id,
        storageKey: image.storageKey,
        url: image.url,
        rank: image.rank,
        variantStatus: image.variantStatus,
        variantError: image.variantError,
        variantsGeneratedAt: image.variantsGeneratedAt,
        variants: image.variants
          ? Object.entries(image.variants).map(([variant, value]) => ({
            id: `${image.id}:${variant}`,
            variant,
            storageKey: value.storageKey,
            url: value.url,
            width: value.width,
            height: value.height,
            format: value.format,
          }))
          : undefined,
      })),
      variants: document.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        optionValue1: variant.optionValue1,
        optionValue2: variant.optionValue2,
        imageStorageKey: variant.imageStorageKey,
        rank: variant.rank,
      })),
      inventory: await Promise.all(document.inventory.map(async (inventory) => {
        const variant = inventory.productVariantId
          ? variantsById.get(inventory.productVariantId)
          : undefined;

        return {
          ...(await this.resolveCatalogInventoryPricing(inventory)),
          optionValue1: variant?.optionValue1,
          optionValue2: variant?.optionValue2,
        };
      })),
      shipping: document.shipping
        ? {
          originCountry: document.shipping.originCountry,
          processTimeLabel: document.shipping.processTimeLabel,
          destinations: document.shipping.destinations.map((destination) => ({
            id: destination.id,
            countryCode: destination.countryCode,
            deliveryTimeLabel: destination.deliveryTimeLabel,
            service: destination.service,
            chargeType: destination.chargeType as PublicProductDetail['shipping'] extends undefined
              ? never
              : NonNullable<PublicProductDetail['shipping']>['destinations'][number]['chargeType'],
            rank: destination.rank,
          })),
        }
        : undefined,
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

  private async filterDocumentsByResolvedPrice(
    documents: CatalogProductDocument[],
    input: ListPublicProductsInput
  ): Promise<CatalogProductDocument[]> {
    const resolvedDocuments = await Promise.all(
      documents
        .filter((document) => this.shouldIncludeInPublicList(document))
        .map(async (document) => ({
          document,
          item: await this.toPublicProductListItem(document),
        }))
    );

    return resolvedDocuments
      .filter(({ item }) => this.matchesResolvedPrice(item, input))
      .map(({ document }) => document);
  }

  private matchesResolvedPrice(
    item: PublicProductListItem,
    input: ListPublicProductsInput
  ): boolean {
    const amountMinor = item.pricing?.minAmountMinor;

    if (amountMinor == null) {
      return false;
    }

    if (input.minPriceMinor !== undefined && amountMinor < input.minPriceMinor) {
      return false;
    }

    if (input.maxPriceMinor !== undefined && amountMinor > input.maxPriceMinor) {
      return false;
    }

    return true;
  }
}

function toMajorUnits(amountMinor: number, currency: string): number {
  return amountMinor / (currency === 'JPY' || currency === 'KRW' || currency === 'VND' ? 1 : 100);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compareSuggestionDocuments(
  left: CatalogProductDocument,
  right: CatalogProductDocument,
  normalizedSearch: string
): number {
  const leftRank = getSuggestionRank(left, normalizedSearch);
  const rightRank = getSuggestionRank(right, normalizedSearch);

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return right.sort.createdAt.getTime() - left.sort.createdAt.getTime();
}

function compareResolvedListItems(
  left: PublicProductListItem,
  right: PublicProductListItem,
  order?: ListPublicProductsInput['order']
): number {
  if (order === 'price_asc' || order === 'price_desc') {
    const leftAmount = left.pricing?.minAmountMinor ?? (order === 'price_asc' ? Number.MAX_SAFE_INTEGER : -1);
    const rightAmount = right.pricing?.minAmountMinor ?? (order === 'price_asc' ? Number.MAX_SAFE_INTEGER : -1);

    if (leftAmount !== rightAmount) {
      return order === 'price_asc'
        ? leftAmount - rightAmount
        : rightAmount - leftAmount;
    }
  }

  return right.createdAt.getTime() - left.createdAt.getTime();
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

function buildFacetResult(documents: CatalogProductDocument[]): PublicProductFacet[] {
  const facets = new Map<string, {
    facetKey: string;
    attributeName: string;
    options: Map<string, string>;
  }>();

  documents.forEach((document) => {
    (document.attributes ?? []).forEach((attribute) => {
      if (!attribute.selectedOptionId || !attribute.selectedOptionValue) {
        return;
      }

      const existingFacet = facets.get(attribute.categoryAttributeKey) ?? {
        facetKey: attribute.categoryAttributeKey,
        attributeName: attribute.categoryAttributeName,
        options: new Map(),
      };
      const canonicalOption = toCanonicalFacetOption(
        attribute.categoryAttributeKey,
        attribute.selectedOptionValue
      );
      existingFacet.options.set(canonicalOption.optionKey, canonicalOption.value);
      facets.set(attribute.categoryAttributeKey, existingFacet);
    });
  });

  return Array.from(facets.values())
    .map((facet) => ({
      facetKey: facet.facetKey,
      attributeName: facet.attributeName,
      options: Array.from(facet.options.entries())
        .sort((left, right) => left[1].localeCompare(right[1]))
        .map(([optionKey, value]) => ({
          optionKey,
          value,
        })),
    }))
    .sort(compareFacetNames);
}

function compareFacetNames(
  left: Pick<PublicProductFacet, 'attributeName'>,
  right: Pick<PublicProductFacet, 'attributeName'>
): number {
  const leftIndex = PUBLIC_PRODUCT_FACET_PRIORITY.indexOf(left.attributeName as never);
  const rightIndex = PUBLIC_PRODUCT_FACET_PRIORITY.indexOf(right.attributeName as never);
  const normalizedLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
  const normalizedRightIndex = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

  if (normalizedLeftIndex !== normalizedRightIndex) {
    return normalizedLeftIndex - normalizedRightIndex;
  }

  return left.attributeName.localeCompare(right.attributeName);
}

function getSuggestionRank(
  document: CatalogProductDocument,
  normalizedSearch: string
): number {
  const title = document.titleNormalized;
  const description = document.descriptionNormalized;

  if (title === normalizedSearch) return 0;
  if (title.startsWith(normalizedSearch)) return 1;
  if (title.includes(normalizedSearch)) return 2;
  if (description.includes(normalizedSearch)) return 3;
  return 4;
}
