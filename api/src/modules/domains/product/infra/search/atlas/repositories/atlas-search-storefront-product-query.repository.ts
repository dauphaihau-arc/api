import { Inject, Injectable } from '@nestjs/common';
import { buildPaginationMeta } from '~/common/application/pagination';
import { CATALOG_CONFIG, type CatalogConfig } from '~/config/catalog.config';
import {
  STOREFRONT_PRICING_CONFIG,
  type StorefrontPricingConfig,
} from '~/config/storefront-pricing.config';
import { ProductState } from '../../../../domain/enums/product-state.enum';
import { toCanonicalFacetOption } from '../../../../app/shoe-size-groups';
import { CatalogProductSlugRepository } from '../../../../app/ports/catalog-product-slug.repository';
import { CatalogProductPriceDocumentRepository } from '../../../../app/ports/catalog-product-price-document.repository';
import { StorefrontProductQueryRepository } from '../../../../app/ports/storefront-product-query.repository';
import {
  getIndexedInventoryPrice,
  getIndexedPriceSummary,
  getIndexedPricingFieldPath,
  isIndexedPricingSelection,
  resolveIndexedPricingSelection,
  type StorefrontIndexedPricingSelection,
} from '../../../../app/storefront-indexed-pricing';
import { StorefrontMarketContextService } from '../../../../app/services/storefront-market-context.service';
import { CatalogMongoAccess } from '../../../catalog/mongo/access/catalog-mongo.access';
import type {
  ListPublicProductsInput,
  PublicProductFacet,
  PublicProductDetail,
  PublicProductListItem,
  PublicProductListResult,
  PublicProductSuggestion,
  SuggestPublicProductsInput,
} from '../../../../app/product.types';
import { PUBLIC_PRODUCT_FACET_PRIORITY } from '../../../../app/product-facet.constants';
import type { CatalogProductDocument } from '../../../catalog/mongo/documents/catalog-product-document.mapper';
import type { CatalogProductPriceDocument } from '../../../catalog/mongo/documents/catalog-product-price-document.mapper';
import type { CatalogSearchDocument } from '../../../catalog/mongo/documents/catalog-search-document.mapper';
import { getInferredFacetTerms, isInferredFacetSupported } from '../../../inferred-facets';
import { PRODUCT_STOCK_NOTICE_THRESHOLD } from '../../../../app/product-stock.constants';
import { MikroOrmStorefrontProductQueryRepository } from '../../../persistence/mikro-orm/repositories/mikro-orm-storefront-product-query.repository';

type MongoAggregateCursorLike<TDocument> = {
  toArray(): Promise<TDocument[]>;
};

type MongoCollectionLike<TDocument> = {
  findOne(filter: Record<string, unknown>): Promise<TDocument | null>;
  aggregate<TResult = TDocument>(
    pipeline: Array<Record<string, unknown>>
  ): MongoAggregateCursorLike<TResult>;
};

interface AtlasSearchMetaResult {
  count?: {
    total?: number;
  };
}

@Injectable()
export class AtlasSearchStorefrontProductQueryRepository
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
    private readonly mikroOrmStorefrontProductQueryRepository: MikroOrmStorefrontProductQueryRepository,
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
    if (!isIndexedPricingSelection(this.storefrontPricingConfig, pricingSelection)) {
      return this.mikroOrmStorefrontProductQueryRepository.findPublicByShopSlugAndProductSlug(
        shopSlug,
        productSlug,
      );
    }

    return document ? toPublicProductDetail(document, priceDocument, pricingSelection) : null;
  }

  async findPublicByIds(productIds: string[]): Promise<PublicProductListItem[]> {
    // Recommendation-style endpoints need request-aware pricing resolution.
    return this.mikroOrmStorefrontProductQueryRepository.findPublicByIds(productIds);
  }

  async listPublic(
    input: ListPublicProductsInput,
  ): Promise<PublicProductListResult> {
    this.assertAtlasSearchEnabled();

    const searchCollection = await this.getSearchCollection();
    const pricingSelection = resolveIndexedPricingSelection(
      await this.storefrontMarketContextService.resolveCurrentRequest(),
    );
    if (!isIndexedPricingSelection(this.storefrontPricingConfig, pricingSelection)) {
      return this.mikroOrmStorefrontProductQueryRepository.listPublic(input);
    }
    const searchStage = this.buildListSearchStage(input, pricingSelection);
    const totalResults = await searchCollection.aggregate<AtlasSearchMetaResult>([
      {
        $searchMeta: {
          ...searchStage,
          count: {
            type: 'total',
          },
        },
      },
    ]).toArray();

    const total = totalResults[0]?.count?.total ?? 0;

    if (total === 0) {
      return {
        items: [],
        meta: buildPaginationMeta(input.page, input.limit, 0),
      };
    }

    const documents = await searchCollection.aggregate<CatalogSearchDocument>([
      {
        $search: searchStage,
      },
      {
        $skip: (input.page - 1) * input.limit,
      },
      {
        $limit: input.limit,
      },
      {
        $project: {
          _id: 1,
          productId: 1,
          shopId: 1,
          shopPublicId: 1,
          shopSlug: 1,
          shopName: 1,
          slug: 1,
          title: 1,
          categoryId: 1,
          variantType: 1,
          image: 1,
          price: 1,
          pricingByMarket: 1,
          inventory: 1,
          ranking: 1,
        },
      },
    ]).toArray();

    return {
      items: documents.map((document) => toPublicProductListItemFromSearchDocument(document, pricingSelection)),
      meta: buildPaginationMeta(input.page, input.limit, total),
    };
  }

  async listPublicFacets(
    input: ListPublicProductsInput,
  ): Promise<PublicProductFacet[]> {
    this.assertAtlasSearchEnabled();
    const pricingSelection = resolveIndexedPricingSelection(
      await this.storefrontMarketContextService.resolveCurrentRequest(),
    );
    if (!isIndexedPricingSelection(this.storefrontPricingConfig, pricingSelection)) {
      return this.mikroOrmStorefrontProductQueryRepository.listPublicFacets(input);
    }

    const searchCollection = await this.getSearchCollection();
    const documents = await searchCollection.aggregate<{
      _id: {
        attributeKey: string;
        attributeName: string;
        optionValue: string;
      };
    }>([
      {
        $search: this.buildListSearchStage(input, pricingSelection),
      },
      {
        $unwind: '$attributes',
      },
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
    this.assertAtlasSearchEnabled();

    const normalizedSearch = input.search.trim().toLowerCase();

    if (!normalizedSearch) {
      return [];
    }

    const searchCollection = await this.getSearchCollection();
    const documents = await searchCollection.aggregate<CatalogSearchDocument>([
      {
        $search: {
          index: 'product_suggestions',
          compound: {
            should: [
              {
                autocomplete: {
                  query: normalizedSearch,
                  path: 'suggest',
                  tokenOrder: 'sequential',
                },
              },
              {
                text: {
                  query: normalizedSearch,
                  path: ['title', 'keywords'],
                },
              },
            ],
            minimumShouldMatch: 1,
            filter: [
              { equals: { path: 'state', value: ProductState.ACTIVE } },
            ],
          },
        },
      },
      {
        $limit: input.limit,
      },
      {
        $project: {
          _id: 0,
          productId: 1,
          title: 1,
          slug: 1,
          shopId: 1,
          shopPublicId: 1,
          shopName: 1,
          shopSlug: 1,
        },
      },
    ]).toArray();

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

  private buildListSearchStage(
    input: ListPublicProductsInput,
    pricingSelection: StorefrontIndexedPricingSelection | undefined,
  ): Record<string, unknown> {
    const priceFieldPath = pricingSelection
      ? getIndexedPricingFieldPath(pricingSelection, 'minAmountMinor')
      : 'price.minAmountMinor';
    const filter: Array<Record<string, unknown>> = [
      { equals: { path: 'state', value: ProductState.ACTIVE } },
      { equals: { path: 'flags.hasImages', value: true } },
    ];

    if (input.categoryIds?.length) {
      filter.push({
        in: {
          path: 'categoryId',
          value: input.categoryIds,
        },
      });
    }

    if (input.isDigital !== undefined) {
      filter.push({
        equals: {
          path: 'isDigital',
          value: input.isDigital,
        },
      });
    }

    if (input.whoMade) {
      filter.push({
        equals: {
          path: 'whoMade',
          value: input.whoMade,
        },
      });
    }

    if (input.minPriceMinor !== undefined) {
      filter.push({
        range: {
          path: priceFieldPath,
          gte: input.minPriceMinor,
        },
      });
    }

    if (input.maxPriceMinor !== undefined) {
      filter.push({
        range: {
          path: priceFieldPath,
          lte: input.maxPriceMinor,
        },
      });
    }

    if (input.attributeFilters?.length) {
      input.attributeFilters.forEach((attributeFilter) => {
        const structuredOperator = {
          embeddedDocument: {
            path: 'attributes',
            operator: {
              compound: {
                filter: [
                  attributeFilter.attributeId
                    ? {
                      equals: {
                        path: 'attributes.categoryAttributeKey',
                        value: attributeFilter.attributeId,
                      },
                    }
                    : {
                      equals: {
                        path: 'attributes.categoryAttributeName',
                        value: attributeFilter.attributeName,
                      },
                    },
                  attributeFilter.selectedOptionIds?.length
                    ? {
                      in: {
                        path: 'attributes.selectedOptionId',
                        value: attributeFilter.selectedOptionIds,
                      },
                    }
                    : attributeFilter.selectedOptionKeys?.length
                      ? {
                        in: {
                          path: 'attributes.selectedOptionKey',
                          value: attributeFilter.selectedOptionKeys,
                        },
                      }
                      : {
                        in: {
                          path: 'attributes.selectedOptionValue',
                          value: attributeFilter.selectedOptionValues,
                        },
                      },
                ],
              },
            },
          },
        };

        if (attributeFilter.attributeId && isInferredFacetSupported(attributeFilter.attributeId)) {
          const inferredTerms = (
            attributeFilter.selectedOptionKeys?.length
              ? attributeFilter.selectedOptionKeys.flatMap((optionKey) =>
                getInferredFacetTerms(attributeFilter.attributeId as never, optionKey),
              )
              : attributeFilter.selectedOptionValues.flatMap((optionValue) =>
                getInferredFacetTerms(attributeFilter.attributeId as never, toFacetKey(optionValue)),
              )
          ).filter(Boolean);

          const inferredOperators = attributeFilter.selectedOptionKeys?.length
            ? [{
              embeddedDocument: {
                path: 'inferredFacets',
                operator: {
                  compound: {
                    filter: [
                      { equals: { path: 'inferredFacets.facetKey', value: attributeFilter.attributeId } },
                      { in: { path: 'inferredFacets.optionKey', value: attributeFilter.selectedOptionKeys } },
                    ],
                  },
                },
              },
            }]
            : inferredTerms.map((term) => ({
              phrase: {
                path: ['title', 'description'],
                query: term,
              },
            }));

          filter.push({
            compound: {
              should: [structuredOperator, ...inferredOperators],
              minimumShouldMatch: 1,
            },
          });
          return;
        }

        filter.push({
          ...structuredOperator,
        });
      });
    }

    const should: Array<Record<string, unknown>> = [];

    if (input.search?.trim()) {
      should.push({
        text: {
          query: input.search.trim().toLowerCase(),
          path: ['title', 'description', 'keywords'],
        },
      });
    }

    if (input.title?.trim()) {
      should.push({
        autocomplete: {
          query: input.title.trim().toLowerCase(),
          path: 'suggest',
          tokenOrder: 'sequential',
        },
      });
    }

    const compound: Record<string, unknown> = { filter };

    if (should.length > 0) {
      compound.should = should;
      compound.minimumShouldMatch = 1;
    }

    return {
      index: 'product_search',
      compound,
      ...(input.order === 'newest'
        ? {
          sort: {
            'ranking.createdAt': -1,
          },
        }
        : input.order === 'price_asc'
          ? {
            sort: {
              [priceFieldPath]: 1,
              'ranking.createdAt': -1,
            },
          }
          : input.order === 'price_desc'
            ? {
              sort: {
                [priceFieldPath]: -1,
                'ranking.createdAt': -1,
              },
            }
            : {}),
    };
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

  private assertAtlasSearchEnabled(): void {
    if (this.catalogConfig.driver !== 'mongodb') {
      throw new Error('Atlas Search storefront repository requires mongodb catalog driver');
    }

    if (this.catalogConfig.searchDriver !== 'atlas') {
      throw new Error('Atlas Search storefront repository requires CATALOG_SEARCH_DRIVER=atlas');
    }
  }

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
