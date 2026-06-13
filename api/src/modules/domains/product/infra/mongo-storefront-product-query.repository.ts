import { Inject, Injectable } from '@nestjs/common';
import { buildPaginationMeta } from '~/common/application/pagination';
import { CATALOG_CONFIG, type CatalogConfig } from '~/config/catalog.config';
import { ProductState } from '../domain/enums/product-state.enum';
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
    private readonly catalogMongoAccess: CatalogMongoAccess
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
    const filter = this.buildListFilter(input);
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

    const items = documents
      .filter((document) => this.shouldIncludeInPublicList(document))
      .map((document) => this.toPublicProductListItem(document));

    return {
      items,
      meta: buildPaginationMeta(input.page, input.limit, total),
    };
  }

  async listPublicFacets(
    input: ListPublicProductsInput
  ): Promise<PublicProductFacet[]> {
    const collection = await this.getCollection();
    const filter = this.buildListFilter(input);
    const documents = await collection.find(filter).toArray();

    return buildFacetResult(
      documents.filter((document) => this.shouldIncludeInPublicList(document))
    );
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
    input: ListPublicProductsInput
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

  private shouldIncludeInPublicList(document: CatalogProductDocument): boolean {
    return document.state === ProductState.ACTIVE && document.images.length > 0;
  }

  private toPublicProductListItem(
    document: CatalogProductDocument
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
      image: document.primaryImage,
      variantType: document.variantType,
      inventory: document.primaryInventory
        ? {
          amountMinor: document.primaryInventory.amountMinor,
          originalAmountMinor: document.primaryInventory.originalAmountMinor,
          currency: document.primaryInventory.currency,
          stock: document.primaryInventory.stock,
          sku: document.primaryInventory.sku,
        }
        : undefined,
      createdAt: document.sort.createdAt,
    };
  }

  private toPublicProductDetail(
    document: CatalogProductDocument
  ): PublicProductDetail {
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
      inventory: document.inventory.map((inventory) => ({
        id: inventory.id,
        productVariantId: inventory.productVariantId,
        sku: inventory.sku,
        stock: inventory.stock,
        amountMinor: inventory.amountMinor,
        originalAmountMinor: inventory.originalAmountMinor,
        currency: inventory.currency,
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
