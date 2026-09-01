import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { StructuredLogRecord } from '~/platform/logging/structured-log.types';
import { buildStructuredLog } from '~/platform/utils/structured-log';
import { buildPaginationMeta } from '~/platform/application/pagination';
import { CATALOG_CONFIG, type CatalogConfig } from '~/platform/config/catalog.config';
import {
  STOREFRONT_PRICING_CONFIG,
  type StorefrontPricingConfig,
} from '~/platform/config/storefront-pricing.config';
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
import { RequestContextService } from '~/platform/request-context/request-context.service';
import { getActiveTraceContext } from '~/platform/observability/tracing';
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

type MongoAggregateCursorLike<TDocument> = {
  toArray(): Promise<TDocument[]>;
};

type MongoFindCursorLike<TDocument> = {
  sort(sort: Record<string, 1 | -1>): MongoFindCursorLike<TDocument>;
  skip(value: number): MongoFindCursorLike<TDocument>;
  limit(value: number): MongoFindCursorLike<TDocument>;
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
    @InjectPinoLogger(AtlasSearchStorefrontProductQueryRepository.name)
    private readonly logger: PinoLogger,
    private readonly catalogProductSlugRepository: CatalogProductSlugRepository,
    private readonly catalogProductPriceDocumentRepository: CatalogProductPriceDocumentRepository,
    private readonly catalogMongoAccess: CatalogMongoAccess,
    private readonly storefrontMarketContextService: StorefrontMarketContextService,
    private readonly requestContextService: RequestContextService,
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

    const pricingSelection = resolveIndexedPricingSelection(
      await this.storefrontMarketContextService.resolveCurrentRequest(),
    );

    this.assertAtlasSearchEnabled();

    const searchCollection = await this.getSearchCollection();

    const documents = await searchCollection.aggregate<CatalogSearchDocument>([
      {
        $match: {
          productId: { $in: productIds },
          state: ProductState.ACTIVE,
          'flags.hasImages': true,
        },
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
          flags: 1,
        },
      },
    ]).toArray();

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

  async listPublic(
    input: ListPublicProductsInput,
  ): Promise<PublicProductListResult> {
    this.assertAtlasSearchEnabled();

    const searchCollection = await this.getSearchCollection();

    const pricingSelection = resolveIndexedPricingSelection(
      await this.storefrontMarketContextService.resolveCurrentRequest(),
    );

    const indexedPricingSelection = this.toIndexedPricingSelection(pricingSelection);
    const requestSummary = this.summarizeListPublicInput(input, indexedPricingSelection);

    if (this.canUseDirectBrowseQuery(input)) {
      return this.listPublicFromBrowseCollection(
        searchCollection,
        input,
        indexedPricingSelection,
        requestSummary,
      );
    }

    const searchStage = this.buildListSearchStage(input, indexedPricingSelection);

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
          flags: 1,
        },
      },
    ]).toArray();

    return {
      items: documents.map((document) => toPublicProductListItemFromSearchDocument(document, indexedPricingSelection)),
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

    const indexedPricingSelection = this.toIndexedPricingSelection(pricingSelection);
    const searchCollection = await this.getSearchCollection();

    const documents = await searchCollection.aggregate<{
      _id: {
        attributeKey: string;
        attributeName: string;
        optionValue: string;
      };
    }>([
      {
        $search: this.buildListSearchStage(input, indexedPricingSelection),
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

  private canUseDirectBrowseQuery(
    input: ListPublicProductsInput,
  ): boolean {
    if (input.search?.trim() || input.title?.trim()) {
      return false;
    }

    if (input.minPriceMinor !== undefined || input.maxPriceMinor !== undefined) {
      return false;
    }

    if (input.order === 'price_asc' || input.order === 'price_desc') {
      return false;
    }

    return !input.attributeFilters?.some((attributeFilter) =>
      attributeFilter.attributeId
      && isInferredFacetSupported(attributeFilter.attributeId)
      && !attributeFilter.selectedOptionKeys?.length,
    );
  }

  private async listPublicFromBrowseCollection(
    searchCollection: MongoCollectionLike<CatalogSearchDocument>,
    input: ListPublicProductsInput,
    pricingSelection: StorefrontIndexedPricingSelection | undefined,
    requestSummary: ReturnType<typeof this.summarizeListPublicInput>,
  ): Promise<PublicProductListResult> {
    const filter = this.buildDirectBrowseFilter(input);
    const countStartedAt = process.hrtime.bigint();

    const countPromise = searchCollection.countDocuments(filter)
      .then((total) => ({
        total,
        countDurationMs: this.durationMsSince(countStartedAt),
      }));

    const documentsPromise = searchCollection
      .find(filter, {
        projection: {
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
          flags: 1,
          variantCount: 1,
        },
      })
      .sort({ 'ranking.createdAt': -1 })
      .skip((input.page - 1) * input.limit)
      .limit(input.limit)
      .toArray();

    const [
      {
        total,
        countDurationMs,
      },
      documents,
    ] = await Promise.all([countPromise, documentsPromise]);

    this.logger.info(
      this.buildListPublicLogPayload(
        'catalog.storefront.list_public.direct_browse_count',
        {
          branch: 'direct_browse',
          countDurationMs,
          total,
          ...requestSummary,
        },
      ),
      `Direct browse count finished in ${Math.round(countDurationMs)}ms`,
    );

    if (total === 0) {
      return {
        items: [],
        meta: buildPaginationMeta(input.page, input.limit, 0),
      };
    }

    return {
      items: documents.map((document) => toPublicProductListItemFromSearchDocument(document, pricingSelection)),
      meta: buildPaginationMeta(input.page, input.limit, total),
    };
  }

  private buildDirectBrowseFilter(
    input: ListPublicProductsInput,
  ): Record<string, unknown> {
    const filters: Record<string, unknown>[] = [
      { state: ProductState.ACTIVE },
      { 'flags.hasImages': true },
    ];

    if (input.categoryIds?.length) {
      filters.push({
        categoryId: { $in: input.categoryIds },
      });
    }

    if (input.isDigital !== undefined) {
      filters.push({
        isDigital: input.isDigital,
      });
    }

    if (input.whoMade) {
      filters.push({
        whoMade: input.whoMade,
      });
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

    return filters.length === 1
      ? filters[0]
      : { $and: filters };
  }

  private summarizeListPublicInput(
    input: ListPublicProductsInput,
    pricingSelection: StorefrontIndexedPricingSelection | undefined,
  ): {
    page: number;
    limit: number;
    order: string;
    hasSearch: boolean;
    hasTitle: boolean;
    categoryCount: number;
    attributeFilterCount: number;
    minPriceMinor?: number;
    maxPriceMinor?: number;
    marketCode?: string;
    currency?: string;
  } {
    return {
      page: input.page,
      limit: input.limit,
      order: input.order ?? 'default',
      hasSearch: Boolean(input.search?.trim()),
      hasTitle: Boolean(input.title?.trim()),
      categoryCount: input.categoryIds?.length ?? 0,
      attributeFilterCount: input.attributeFilters?.length ?? 0,
      ...(input.minPriceMinor !== undefined ? { minPriceMinor: input.minPriceMinor } : {}),
      ...(input.maxPriceMinor !== undefined ? { maxPriceMinor: input.maxPriceMinor } : {}),
      ...(pricingSelection
        ? {
          marketCode: pricingSelection.marketCode,
          currency: pricingSelection.currency,
        }
        : {}),
    };
  }

  private durationMsSince(startedAt: bigint): number {
    return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  }

  private buildListPublicLogPayload(
    event: string,
    atlas: StructuredLogRecord,
  ): StructuredLogRecord {
    const requestContext = this.requestContextService.get();
    const traceContext = getActiveTraceContext();

    return buildStructuredLog({
      context: AtlasSearchStorefrontProductQueryRepository.name,
      event,
      requestId: requestContext.requestId,
      actorId: requestContext.actorId,
      actorEmail: requestContext.actorEmail,
      sessionId: requestContext.sessionId,
      traceId: traceContext?.traceId,
      spanId: traceContext?.spanId,
      market: {
        marketCode: requestContext.marketCode,
        currency: requestContext.currency,
        locale: requestContext.locale,
        channel: requestContext.channel,
      },
      http: {
        route: '/v1/products',
        path: '/v1/products',
      },
      atlas,
    });
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
