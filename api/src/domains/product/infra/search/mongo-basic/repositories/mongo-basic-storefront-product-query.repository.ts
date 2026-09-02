import { Inject, Injectable } from '@nestjs/common';
import { buildPaginationMeta } from '~/platform/application/pagination';
import { CATALOG_CONFIG, type CatalogConfig } from '~/platform/config/catalog.config';
import {
  STOREFRONT_PRICING_CONFIG,
  type StorefrontPricingConfig,
} from '~/platform/config/storefront-pricing.config';
import { StorefrontProductQueryRepository } from '../../../../app/ports/storefront-product-query.repository';
import { CatalogProductSlugRepository } from '../../../../app/ports/catalog-product-slug.repository';
import { CatalogProductPriceDocumentRepository } from '../../../../app/ports/catalog-product-price-document.repository';
import {
  getIndexedInventoryPrice,
  getIndexedPriceSummary,
  getIndexedPricingFieldPath,
  isIndexedPricingSelection,
  resolveIndexedPricingSelection,
  type StorefrontIndexedPricingSelection,
} from '../../../../app/storefront-indexed-pricing';
import { StorefrontMarketContextService } from '../../../../app/services/storefront-market-context.service';
import type {
  ListPublicProductsInput,
  PublicProductDetail,
  PublicProductFacet,
  PublicProductListItem,
  PublicProductListResult,
  PublicProductSuggestion,
  SuggestPublicProductsInput,
} from '../../../../app/product.types';
import { PUBLIC_PRODUCT_FACET_PRIORITY } from '../../../../app/product-facet.constants';
import { toCanonicalFacetOption } from '../../../../app/shoe-size-groups';
import { PRODUCT_STOCK_NOTICE_THRESHOLD } from '../../../../app/product-stock.constants';
import { ProductState } from '../../../../domain/enums/product-state.enum';
import { CatalogMongoAccess } from '../../../catalog/mongo/access/catalog-mongo.access';
import type { CatalogProductDocument } from '../../../catalog/mongo/documents/catalog-product-document.mapper';
import type { CatalogProductPriceDocument } from '../../../catalog/mongo/documents/catalog-product-price-document.mapper';
import type { CatalogSearchDocument } from '../../../catalog/mongo/documents/catalog-search-document.mapper';
import { isInferredFacetSupported } from '../../../inferred-facets';

type MongoFindCursorLike<TDocument> = {
  sort(sort: Record<string, 1 | -1>): MongoFindCursorLike<TDocument>;
  skip(value: number): MongoFindCursorLike<TDocument>;
  limit(value: number): MongoFindCursorLike<TDocument>;
  toArray(): Promise<TDocument[]>;
};

type MongoAggregateCursorLike<TDocument> = {
  toArray(): Promise<TDocument[]>;
};

type MongoCollectionLike<TDocument> = {
  findOne(filter: Record<string, unknown>): Promise<TDocument | null>;
  countDocuments(filter: Record<string, unknown>): Promise<number>;
  find(
    filter: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): MongoFindCursorLike<TDocument>;
  aggregate<TResult = TDocument>(
    pipeline: Array<Record<string, unknown>>
  ): MongoAggregateCursorLike<TResult>;
};

@Injectable()
export class MongoBasicStorefrontProductQueryRepository
implements StorefrontProductQueryRepository {
  constructor(
    @Inject(CATALOG_CONFIG)
    private readonly catalogConfig: CatalogConfig,
    @Inject(STOREFRONT_PRICING_CONFIG)
    private readonly storefrontPricingConfig: StorefrontPricingConfig,
    private readonly catalogProductSlugRepository: CatalogProductSlugRepository,
    private readonly catalogProductPriceDocumentRepository: CatalogProductPriceDocumentRepository,
    private readonly catalogMongoAccess: CatalogMongoAccess,
    private readonly storefrontMarketContextService: StorefrontMarketContextService,
  ) {}

  async findPublicByShopSlugAndProductSlug(
    shopSlug: string,
    productSlug: string,
  ): Promise<PublicProductDetail | null> {
    const productId = await this.catalogProductSlugRepository.findProductIdByShopAndSlug(
      shopSlug,
      productSlug,
    );

    if (!productId) {
      return null;
    }

    const collection = await this.getProductsCollection();
    const document = await collection.findOne({
      productId,
      state: ProductState.ACTIVE,
    });
    const priceDocument = await this.catalogProductPriceDocumentRepository.findByProductId(productId);
    const pricingSelection = resolveIndexedPricingSelection(
      await this.storefrontMarketContextService.resolveCurrentRequest(),
    );

    return document ? toPublicProductDetail(document, priceDocument, pricingSelection) : null;
  }

  async findPublicByIds(productIds: string[]): Promise<PublicProductListItem[]> {
    if (productIds.length === 0) {
      return [];
    }

    const pricingSelection = this.toIndexedPricingSelection(resolveIndexedPricingSelection(
      await this.storefrontMarketContextService.resolveCurrentRequest(),
    ));
    const searchCollection = await this.getSearchCollection();
    const documents = await searchCollection
      .find({
        productId: { $in: productIds },
        state: ProductState.ACTIVE,
        'flags.hasImages': true,
      })
      .toArray();
    const documentsById = new Map(
      documents.map((document) => [document.productId, document] as const),
    );

    return productIds
      .map((productId) => documentsById.get(productId))
      .filter((document): document is CatalogSearchDocument => document != null)
      .map((document) => toPublicProductListItemFromSearchDocument(document, pricingSelection));
  }

  async findPublicCardsByIds(productIds: string[]): Promise<PublicProductListItem[]> {
    return this.findPublicByIds(productIds);
  }

  async listPublic(input: ListPublicProductsInput): Promise<PublicProductListResult> {
    const pricingSelection = this.toIndexedPricingSelection(resolveIndexedPricingSelection(
      await this.storefrontMarketContextService.resolveCurrentRequest(),
    ));
    const collection = await this.getSearchCollection();
    const filter = this.buildFilter(input, pricingSelection);
    const totalPromise = collection.countDocuments(filter);
    const documentsPromise = collection
      .find(filter)
      .sort(this.buildSort(input, pricingSelection))
      .skip((input.page - 1) * input.limit)
      .limit(input.limit)
      .toArray();
    const [total, documents] = await Promise.all([totalPromise, documentsPromise]);

    return {
      items: documents.map((document) => toPublicProductListItemFromSearchDocument(document, pricingSelection)),
      meta: buildPaginationMeta(input.page, input.limit, total),
    };
  }

  async listPublicFacets(input: ListPublicProductsInput): Promise<PublicProductFacet[]> {
    const pricingSelection = this.toIndexedPricingSelection(resolveIndexedPricingSelection(
      await this.storefrontMarketContextService.resolveCurrentRequest(),
    ));
    const collection = await this.getSearchCollection();
    const documents = await collection.aggregate<{
      _id: {
        attributeKey: string;
        attributeName: string;
        optionValue: string;
      };
    }>([
      { $match: this.buildFilter(input, pricingSelection) },
      { $unwind: '$attributes' },
      {
        $match: {
          'attributes.categoryAttributeName': { $exists: true, $ne: null },
          'attributes.categoryAttributeKey': { $exists: true, $ne: null },
          'attributes.selectedOptionValue': { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: {
            attributeKey: '$attributes.categoryAttributeKey',
            attributeName: '$attributes.categoryAttributeName',
            optionValue: '$attributes.selectedOptionValue',
          },
        },
      },
      {
        $sort: {
          '_id.attributeName': 1,
          '_id.optionValue': 1,
        },
      },
    ]).toArray();

    const facets = new Map<string, PublicProductFacet>();

    documents.forEach((row) => {
      const facet = facets.get(row._id.attributeKey) ?? {
        facetKey: row._id.attributeKey,
        attributeName: row._id.attributeName,
        options: [] as PublicProductFacet['options'],
      };
      const canonicalOption = toCanonicalFacetOption(row._id.attributeKey, row._id.optionValue);
      const hasOption = facet.options.some((option) => option.optionKey === canonicalOption.optionKey);

      if (!hasOption) {
        facet.options.push(canonicalOption);
      }

      facets.set(row._id.attributeKey, facet);
    });

    return Array.from(facets.values()).sort(compareFacetNames);
  }

  async suggestPublic(
    input: SuggestPublicProductsInput,
  ): Promise<PublicProductSuggestion[]> {
    const normalizedSearch = input.search.trim();

    if (!normalizedSearch) {
      return [];
    }

    const collection = await this.getSearchCollection();
    const documents = await collection
      .find({
        state: ProductState.ACTIVE,
        ...buildTextFilter(normalizedSearch),
      })
      .sort({ 'ranking.createdAt': -1 })
      .limit(input.limit)
      .toArray();

    return documents.map((document) => ({
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

  private buildFilter(
    input: ListPublicProductsInput,
    pricingSelection: StorefrontIndexedPricingSelection | undefined,
  ): Record<string, unknown> {
    const filters: Record<string, unknown>[] = [
      { state: ProductState.ACTIVE },
      { 'flags.hasImages': true },
    ];

    if (input.categoryIds?.length) {
      filters.push({ categoryId: { $in: input.categoryIds } });
    }

    if (input.isDigital !== undefined) {
      filters.push({ isDigital: input.isDigital });
    }

    if (input.whoMade) {
      filters.push({ whoMade: input.whoMade });
    }

    const textQuery = input.search?.trim() || input.title?.trim();

    if (textQuery) {
      filters.push(buildTextFilter(textQuery));
    }

    const minPriceField = pricingSelection
      ? getIndexedPricingFieldPath(pricingSelection, 'minAmountMinor')
      : 'price.minAmountMinor';
    const maxPriceField = pricingSelection
      ? getIndexedPricingFieldPath(pricingSelection, 'maxAmountMinor')
      : 'price.maxAmountMinor';

    if (input.minPriceMinor !== undefined) {
      filters.push({ [maxPriceField]: { $gte: input.minPriceMinor } });
    }

    if (input.maxPriceMinor !== undefined) {
      filters.push({ [minPriceField]: { $lte: input.maxPriceMinor } });
    }

    input.attributeFilters?.forEach((attributeFilter) => {
      const baseAttributeMatch = attributeFilter.attributeId
        ? { categoryAttributeKey: attributeFilter.attributeId }
        : { categoryAttributeName: attributeFilter.attributeName };

      if (attributeFilter.selectedOptionIds?.length) {
        filters.push({
          attributes: {
            $elemMatch: {
              ...baseAttributeMatch,
              selectedOptionId: { $in: attributeFilter.selectedOptionIds },
            },
          },
        });
        return;
      }

      if (attributeFilter.selectedOptionKeys?.length) {
        const structuredFilter = {
          attributes: {
            $elemMatch: {
              ...baseAttributeMatch,
              selectedOptionKey: { $in: attributeFilter.selectedOptionKeys },
            },
          },
        };

        if (attributeFilter.attributeId && isInferredFacetSupported(attributeFilter.attributeId)) {
          filters.push({
            $or: [
              structuredFilter,
              {
                inferredFacets: {
                  $elemMatch: {
                    facetKey: attributeFilter.attributeId,
                    optionKey: { $in: attributeFilter.selectedOptionKeys },
                  },
                },
              },
            ],
          });
          return;
        }

        filters.push(structuredFilter);
        return;
      }

      filters.push({
        attributes: {
          $elemMatch: {
            ...baseAttributeMatch,
            selectedOptionValue: { $in: attributeFilter.selectedOptionValues },
          },
        },
      });
    });

    return filters.length === 1 ? filters[0] : { $and: filters };
  }

  private buildSort(
    input: ListPublicProductsInput,
    pricingSelection: StorefrontIndexedPricingSelection | undefined,
  ): Record<string, 1 | -1> {
    if (input.order === 'price_asc') {
      return {
        [pricingSelection
          ? getIndexedPricingFieldPath(pricingSelection, 'minAmountMinor')
          : 'price.minAmountMinor']: 1,
        'ranking.createdAt': -1,
      };
    }

    if (input.order === 'price_desc') {
      return {
        [pricingSelection
          ? getIndexedPricingFieldPath(pricingSelection, 'maxAmountMinor')
          : 'price.maxAmountMinor']: -1,
        'ranking.createdAt': -1,
      };
    }

    return { 'ranking.createdAt': -1 };
  }

  private async getProductsCollection(): Promise<MongoCollectionLike<CatalogProductDocument>> {
    return this.catalogMongoAccess.getCollection<MongoCollectionLike<CatalogProductDocument>>(
      this.catalogConfig.mongodbProductsCollection,
    );
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
}

function buildTextFilter(search: string): Record<string, unknown> {
  const regex = new RegExp(escapeRegex(search.trim().toLowerCase()), 'i');

  return {
    $or: [
      { title: regex },
      { description: regex },
      { keywords: regex },
      { suggest: regex },
    ],
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compareFacetNames(
  left: Pick<PublicProductFacet, 'attributeName'>,
  right: Pick<PublicProductFacet, 'attributeName'>,
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
    variantType: document.variantType,
    pricing: {
      minAmountMinor: indexedPricing?.minAmountMinor ?? document.price.minAmountMinor,
      maxAmountMinor: indexedPricing?.maxAmountMinor ?? document.price.maxAmountMinor,
      originalMinAmountMinor: indexedPricing?.originalMinAmountMinor ?? document.price.originalMinAmountMinor,
      originalMaxAmountMinor: indexedPricing?.originalMaxAmountMinor ?? document.price.originalMaxAmountMinor,
      currency: indexedPricing?.currency ?? document.price.currency,
      autoSale: indexedPricing?.autoSale ?? document.price.autoSale,
    },
    availability: {
      inStock: document.inventory.inStock,
      lowStock: document.inventory.totalStock > 0
        && document.inventory.totalStock < PRODUCT_STOCK_NOTICE_THRESHOLD,
      stockTotal: document.inventory.totalStock,
    },
    variantCount: document.variantCount,
    hasFreeShipping: document.flags?.hasFreeShipping ?? false,
    createdAt: document.ranking.createdAt,
  };
}

function toPublicProductDetail(
  document: CatalogProductDocument,
  priceDocument?: CatalogProductPriceDocument | null,
  pricingSelection?: StorefrontIndexedPricingSelection,
): PublicProductDetail {
  const variantsById = new Map(
    document.variants.map((variant) => [variant.id, variant] as const),
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
    reviewSummary: {
      average: document.ratingAverage,
      count: document.reviewCount,
    },
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
    inventory: document.inventory.map((inventory) => {
      const resolvedPricing = getIndexedInventoryPrice(
        priceDocument?.inventoryPricingById[inventory.id]?.resolvedByMarket,
        pricingSelection,
      ) ?? priceDocument?.inventoryPricingById[inventory.id]?.basePrice;

      return {
        id: inventory.id,
        productVariantId: inventory.productVariantId,
        optionValue1: inventory.productVariantId
          ? variantsById.get(inventory.productVariantId)?.optionValue1
          : undefined,
        optionValue2: inventory.productVariantId
          ? variantsById.get(inventory.productVariantId)?.optionValue2
          : undefined,
        sku: inventory.sku,
        stock: inventory.stock,
        amountMinor: resolvedPricing?.amountMinor,
        originalAmountMinor: resolvedPricing?.originalAmountMinor,
        autoSale: resolvedPricing?.autoSale,
        currency: resolvedPricing?.currency,
      };
    }),
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
