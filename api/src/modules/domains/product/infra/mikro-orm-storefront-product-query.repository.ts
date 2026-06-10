import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { buildPaginationMeta } from '~/common/application/pagination';
import { MARKETPLACE_MARKETS } from '~/config/marketplace.config';
import { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import { RequestContextService } from '~/modules/shared/request-context/request-context.service';
import { StorefrontProductQueryRepository } from '../app/ports/storefront-product-query.repository';
import { ResolvedStorefrontPriceService } from '../app/services/resolved-storefront-price.service';
import type {
  ListPublicProductsInput,
  PublicProductDetail,
  PublicProductListResult,
  PublicProductSuggestion,
  SuggestPublicProductsInput
} from '../app/product.types';
import { ProductState } from '../domain/enums/product-state.enum';
import { ProductInventoryEntity } from './persistence/entities/product-inventory.entity';
import { ProductEntity } from './persistence/entities/product.entity';
import {
  getPrimaryInventory,
  toPublicProductDetail,
  toPublicProductListItem
} from './storefront-product.projector';

@Injectable()
export class MikroOrmStorefrontProductQueryRepository
implements StorefrontProductQueryRepository {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService,
    private readonly resolvedStorefrontPriceService: ResolvedStorefrontPriceService,
    private readonly requestContextService: RequestContextService
  ) {}

  async findPublicByShopSlugAndProductSlug(
    shopSlug: string,
    productSlug: string
  ): Promise<PublicProductDetail | null> {
    const repository = this.entityManager.fork().getRepository(ProductEntity);
    const product = await repository.findOne(
      {
        slug: productSlug,
        state: ProductState.ACTIVE,
        shop: {
          slug: shopSlug,
        },
      },
      {
        populate: [
          'shop',
          'category',
          'images',
          'images.variants',
          'variants',
          'inventoryRecords',
          'inventoryRecords.productVariant',
          'inventoryRecords.prices',
          'shippingProfiles',
          'shippingProfiles.destinations',
        ],
      }
    );

    return product
      ? toPublicProductDetail(product, {
        resolvePricing: (inventory) => this.getResolvedPublicPricing(inventory),
        storageService: this.storageService,
      })
      : null;
  }

  async listPublic(
    input: ListPublicProductsInput
  ): Promise<PublicProductListResult> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);
    const total = await this.countPublicProductIds(entityManager, input);
    const canUseDenormalizedPriceSort = this.canUseDenormalizedPriceSort(input.order);

    if (total === 0) {
      return {
        items: [],
        meta: buildPaginationMeta(input.page, input.limit, 0),
      };
    }

    const pagedProductIds = input.order === 'price_asc' || input.order === 'price_desc'
      ? canUseDenormalizedPriceSort
        ? await this.findPublicProductIds(entityManager, input, {
          limit: input.limit,
          offset: (input.page - 1) * input.limit,
        })
        : await this.findPublicProductIds(entityManager, input)
      : await this.findPublicProductIds(entityManager, input, {
        limit: input.limit,
        offset: (input.page - 1) * input.limit,
      });

    if (pagedProductIds.length === 0) {
      return {
        items: [],
        meta: buildPaginationMeta(input.page, input.limit, total),
      };
    }

    const products = await repository.find(
      { id: { $in: pagedProductIds } },
      {
        populate: [
          'shop',
          'images',
          'images.variants',
          'inventoryRecords',
          'inventoryRecords.prices',
          'inventoryRecords.productVariant',
        ],
      }
    );

    type PublicListLoadedProduct = (typeof products)[number];
    const productsById = new Map(products.map(product => [product.id, product]));
    const orderedProducts: PublicListLoadedProduct[] = pagedProductIds
      .map(productId => productsById.get(productId))
      .filter((product): product is PublicListLoadedProduct => product !== undefined)
      .filter(product => this.shouldIncludeInPublicList(product));

    const pagedProducts = (input.order === 'price_asc' || input.order === 'price_desc')
      && !canUseDenormalizedPriceSort
      ? await this.sortProductsByComparablePrice(orderedProducts, input.order, input.page, input.limit)
      : orderedProducts;

    return {
      items: await Promise.all(
        pagedProducts.map((product) => toPublicProductListItem(product, {
          resolvePricing: (inventory) => this.getResolvedPublicPricing(inventory),
          storageService: this.storageService,
        }))
      ),
      meta: buildPaginationMeta(input.page, input.limit, total),
    };
  }

  async suggestPublic(
    input: SuggestPublicProductsInput
  ): Promise<PublicProductSuggestion[]> {
    const normalizedSearch = input.search.trim().toLowerCase();

    if (!normalizedSearch) {
      return [];
    }

    const titlePrefixPattern = `${this.escapeSearchPattern(normalizedSearch)}%`;
    const containsPattern = `%${this.escapeSearchPattern(normalizedSearch)}%`;
    const rows = await this.entityManager.fork().getConnection().execute<Array<{
      id: string;
      title: string;
      slug: string;
      shop_id: string;
      shop_public_id: string | null;
      shop_name: string;
      shop_slug: string;
    }>>(
      `
        select
          p.id,
          p.title,
          p.slug,
          s.id as shop_id,
          s.public_id as shop_public_id,
          s.shop_name,
          s.slug as shop_slug
        from products p
        inner join shops s on s.id = p.shop_id
        inner join product_images pi on pi.product_id = p.id
        where p.state = ?
          and (
            lower(p.title) like ? escape '\\'
            or lower(p.description) like ? escape '\\'
          )
        group by p.id, s.id
        order by
          case
            when lower(p.title) = ? then 0
            when lower(p.title) like ? escape '\\' then 1
            when lower(p.title) like ? escape '\\' then 2
            when lower(p.description) like ? escape '\\' then 3
            else 4
          end asc,
          p.created_at desc
        limit ?
      `,
      [
        ProductState.ACTIVE,
        containsPattern,
        containsPattern,
        normalizedSearch,
        titlePrefixPattern,
        containsPattern,
        containsPattern,
        input.limit,
      ]
    );

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      shop: {
        id: row.shop_id,
        publicId: row.shop_public_id ?? undefined,
        shopName: row.shop_name,
        slug: row.shop_slug,
      },
    }));
  }

  private async countPublicProductIds(
    entityManager: EntityManager,
    input: ListPublicProductsInput
  ): Promise<number> {
    const { whereClause, params } = this.buildPublicListWhereClause(input);
    const rows = await entityManager.getConnection().execute<{ total: string }[]>(
      `
        select count(distinct p.id)::text as total
        from products p
        inner join product_images pi on pi.product_id = p.id
        ${whereClause}
      `,
      params
    );

    return Number(rows[0]?.total ?? '0');
  }

  private async findPublicProductIds(
    entityManager: EntityManager,
    input: ListPublicProductsInput,
    pagination?: {
      limit: number;
      offset: number;
    }
  ): Promise<string[]> {
    const { whereClause, params } = this.buildPublicListWhereClause(input);
    const { orderByClause, params: orderingParams } = this.buildPublicListOrdering(input);
    const paginationClause = pagination
      ? `limit ${pagination.limit} offset ${pagination.offset}`
      : '';
    const rows = await entityManager.getConnection().execute<{ id: string }[]>(
      `
        select p.id
        from products p
        inner join product_images pi on pi.product_id = p.id
        ${whereClause}
        group by p.id, p.created_at
        ${orderByClause}
        ${paginationClause}
      `,
      [...params, ...orderingParams]
    );

    return rows.map((row) => row.id);
  }

  private buildPublicListWhereClause(
    input: ListPublicProductsInput
  ): { whereClause: string; params: unknown[] } {
    const clauses = ['where p.state = ?'];
    const params: unknown[] = [ProductState.ACTIVE];
    const normalizedSearch = input.search?.trim();
    const normalizedTitle = input.title?.trim();

    if (input.categoryIds?.length) {
      clauses.push(`and p.category_id in (${input.categoryIds.map(() => '?').join(', ')})`);
      params.push(...input.categoryIds);
    }

    if (input.isDigital !== undefined) {
      clauses.push('and p.is_digital = ?');
      params.push(input.isDigital);
    }

    if (input.whoMade) {
      clauses.push('and p.who_made = ?');
      params.push(input.whoMade);
    }

    if (normalizedSearch) {
      const likePattern = this.buildSearchLikePattern(normalizedSearch);
      clauses.push(`
        and (
          lower(p.title) like ? escape '\\'
          or lower(p.description) like ? escape '\\'
        )
      `);
      params.push(likePattern, likePattern);
    }

    if (normalizedTitle) {
      clauses.push('and lower(p.title) like ? escape \'\\\\\'');
      params.push(this.buildSearchLikePattern(normalizedTitle));
    }

    return {
      whereClause: clauses.join('\n'),
      params,
    };
  }

  private buildSearchLikePattern(value: string): string {
    return `%${this.escapeSearchPattern(value.trim().toLowerCase())}%`;
  }

  private buildSearchPrefixPattern(value: string): string {
    return `${this.escapeSearchPattern(value.trim().toLowerCase())}%`;
  }

  private escapeSearchPattern(value: string): string {
    return value
      .replaceAll('\\', '\\\\')
      .replaceAll('%', '\\%')
      .replaceAll('_', '\\_');
  }

  private buildPublicListOrdering(
    input: ListPublicProductsInput
  ): { orderByClause: string; params: unknown[] } {
    const normalizedSearch = input.search?.trim().toLowerCase();
    const denormalizedPriceSort = this.getDenormalizedPriceSortOrdering(input.order);

    if (denormalizedPriceSort) {
      return denormalizedPriceSort;
    }

    if (input.order === 'newest' || !normalizedSearch) {
      return {
        orderByClause: 'order by p.created_at desc',
        params: [],
      };
    }

    const containsPattern = this.buildSearchLikePattern(normalizedSearch);
    const prefixPattern = this.buildSearchPrefixPattern(normalizedSearch);

    return {
      orderByClause: `
        order by
          case
            when lower(p.title) = ? then 0
            when lower(p.title) like ? escape '\\' then 1
            when lower(p.title) like ? escape '\\' then 2
            when lower(p.description) like ? escape '\\' then 3
            else 4
          end asc,
          p.created_at desc
      `,
      params: [
        normalizedSearch,
        prefixPattern,
        containsPattern,
        containsPattern,
      ],
    };
  }

  private getDenormalizedPriceSortOrdering(
    order?: ListPublicProductsInput['order']
  ): { orderByClause: string; params: unknown[] } | null {
    if (order !== 'price_asc' && order !== 'price_desc') {
      return null;
    }

    const sortPriceKey = this.getRequestSortPriceKey();

    if (!sortPriceKey) {
      return null;
    }

    return {
      orderByClause: `
        order by
          coalesce(
            (p.public_sort_prices ->> ?)::integer,
            ${order === 'price_asc' ? Number.MAX_SAFE_INTEGER : -1}
          ) ${order === 'price_asc' ? 'asc' : 'desc'},
          p.created_at desc
      `,
      params: [sortPriceKey],
    };
  }

  private canUseDenormalizedPriceSort(
    order?: ListPublicProductsInput['order']
  ): boolean {
    return (order === 'price_asc' || order === 'price_desc')
      && this.getRequestSortPriceKey() !== undefined;
  }

  private getRequestSortPriceKey(): string | undefined {
    const requestContext = this.requestContextService.get();
    const marketCode = requestContext.marketCode?.trim();
    const currency = requestContext.currency?.trim();

    if (!marketCode || !currency) {
      return undefined;
    }

    const market = MARKETPLACE_MARKETS.find((entry) => entry.code === marketCode && entry.enabled);

    if (!market || market.defaultCurrency !== currency) {
      return undefined;
    }

    return `${market.code}:${market.defaultCurrency}`;
  }

  private async sortProductsByComparablePrice(
    products: ProductEntity[],
    order: 'price_asc' | 'price_desc',
    page: number,
    limit: number
  ): Promise<ProductEntity[]> {
    const productsWithComparablePrice = await Promise.all(
      products.map(async product => ({
        product,
        comparablePrice: await this.getComparablePrice(product),
      }))
    );

    const sortedProducts = productsWithComparablePrice.sort((left, right) => {
      if (left.comparablePrice !== right.comparablePrice) {
        return order === 'price_asc'
          ? left.comparablePrice - right.comparablePrice
          : right.comparablePrice - left.comparablePrice;
      }

      return right.product.createdAt.getTime() - left.product.createdAt.getTime();
    });
    const start = (page - 1) * limit;

    return sortedProducts.slice(start, start + limit).map(({ product }) => product);
  }

  private shouldIncludeInPublicList(product: ProductEntity): boolean {
    return product.state === ProductState.ACTIVE && product.images.getItems().length > 0;
  }

  private async getComparablePrice(product: ProductEntity): Promise<number> {
    const inventory = getPrimaryInventory(product);

    if (!inventory) {
      return Number.POSITIVE_INFINITY;
    }

    const pricing = await this.resolvedStorefrontPriceService.resolveForCurrentRequest(inventory);

    return pricing?.amountMinor ?? Number.POSITIVE_INFINITY;
  }

  private async getResolvedPublicPricing(
    inventory: ProductInventoryEntity
  ): Promise<{ amountMinor?: number; originalAmountMinor?: number; currency?: string }> {
    const pricing = await this.resolvedStorefrontPriceService.resolveForCurrentRequest(inventory);

    return {
      amountMinor: pricing?.amountMinor,
      ...(pricing?.originalAmountMinor !== undefined ? { originalAmountMinor: pricing.originalAmountMinor } : {}),
      currency: pricing?.currency,
    };
  }
}
