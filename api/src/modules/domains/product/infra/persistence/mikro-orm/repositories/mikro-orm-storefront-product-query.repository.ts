import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { buildPaginationMeta } from '~/common/application/pagination';
import { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import { StorefrontProductQueryRepository } from '../../../../app/ports/storefront-product-query.repository';
import { ResolvedStorefrontPriceService } from '../../../../app/services/resolved-storefront-price.service';
import { StorefrontMarketContextService } from '../../../../app/services/storefront-market-context.service';
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
import { toCanonicalFacetOption } from '../../../../app/shoe-size-groups';
import { PRODUCT_STOCK_NOTICE_THRESHOLD } from '../../../../app/product-stock.constants';
import { ProductImageVariant } from '../../../../domain/enums/product-image-variant.enum';
import { ProductShippingCharge } from '../../../../domain/enums/product-shipping-charge.enum';
import { ProductState } from '../../../../domain/enums/product-state.enum';
import { getInferredFacetTerms, isInferredFacetSupported } from '../../../inferred-facets';
import { ProductInventoryEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { VariantPriceEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/variant-price.entity';
import { ProductEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import {
  getPrimaryInventory,
  toPublicProductDetail,
  toPublicProductListItem,
} from '../../../projection/storefront-product.projector';

@Injectable()
export class MikroOrmStorefrontProductQueryRepository
implements StorefrontProductQueryRepository {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService,
    private readonly resolvedStorefrontPriceService: ResolvedStorefrontPriceService,
    private readonly storefrontMarketContextService: StorefrontMarketContextService,
  ) {}

  async findPublicByShopSlugAndProductSlug(
    shopSlug: string,
    productSlug: string,
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
      },
    );

    return product
      ? toPublicProductDetail(product, {
        resolvePricing: (inventory) => this.getResolvedPublicPricing(inventory),
        storageService: this.storageService,
      })
      : null;
  }

  async findPublicByIds(productIds: string[]): Promise<PublicProductListItem[]> {
    if (productIds.length === 0) {
      return [];
    }

    const repository = this.entityManager.fork().getRepository(ProductEntity);
    const products = await repository.find(
      {
        id: { $in: productIds },
        state: ProductState.ACTIVE,
      },
      {
        populate: [
          'shop',
          'category',
          'images',
          'images.variants',
          'variants',
          'inventoryRecords',
          'inventoryRecords.prices',
          'inventoryRecords.productVariant',
          'shippingProfiles',
          'shippingProfiles.destinations',
        ],
      },
    );
    const productsById = new Map(products.map((product) => [product.id, product] as const));
    type LoadedRecentProduct = (typeof products)[number];
    const orderedProducts = productIds
      .map((productId) => productsById.get(productId))
      .filter((product): product is LoadedRecentProduct => product != null)
      .filter((product) => this.shouldIncludeInPublicList(product));
    const pricingByInventoryId = await this.resolvedStorefrontPriceService.resolveManyForCurrentRequest(
      orderedProducts.flatMap((product) => product.inventoryRecords.getItems()),
    );

    return Promise.all(
      orderedProducts.map((product) => toPublicProductListItem(product, {
        resolvePricing: (inventory) =>
          Promise.resolve(pricingByInventoryId.get(inventory.id) ?? {}),
        storageService: this.storageService,
      })),
    );
  }

  async findPublicCardsByIds(productIds: string[]): Promise<PublicProductListItem[]> {
    if (productIds.length === 0) {
      return [];
    }

    const entityManager = this.entityManager.fork();
    const connection = entityManager.getConnection();
    const placeholders = productIds.map(() => '?').join(', ');
    const productRows = await connection.execute<ProductCardRow[]>(
      `
        select
          p.id,
          p.category_id,
          p.title,
          p.slug,
          p.variant_type,
          p.created_at,
          s.id as shop_id,
          s.public_id as shop_public_id,
          s.shop_name,
          s.slug as shop_slug,
          primary_image.storage_key as image_storage_key,
          primary_image.card_storage_key as card_image_storage_key,
          coalesce(variant_counts.variant_count, 0) as variant_count,
          exists (
            select 1
            from product_shipping_profiles psp
            inner join product_shipping_destinations psd
              on psd.product_shipping_profile_id = psp.id
            where psp.product_id = p.id
              and psd.charge_type = ?
          ) as has_free_shipping
        from products p
        inner join shops s on s.id = p.shop_id
        left join lateral (
          select
            pi.storage_key,
            piv.storage_key as card_storage_key
          from product_images pi
          left join product_image_variants piv
            on piv.product_image_id = pi.id
           and piv.variant = ?
          where pi.product_id = p.id
          order by pi.rank asc
          limit 1
        ) primary_image on true
        left join lateral (
          select count(*)::int as variant_count
          from product_variants pv
          where pv.product_id = p.id
        ) variant_counts on true
        where p.id in (${placeholders})
          and p.state = ?
      `,
      [
        ProductShippingCharge.FREE_SHIPPING,
        ProductImageVariant.CARD_1X1,
        ...productIds,
        ProductState.ACTIVE,
      ],
    );

    if (productRows.length === 0) {
      return [];
    }

    const inventoryRows = await connection.execute<InventoryPricingRow[]>(
      `
        select
          pi.id as inventory_id,
          pi.product_id,
          pi.stock,
          pi.updated_at as inventory_updated_at,
          vp.id as price_id,
          vp.market_code,
          vp.currency,
          vp.amount_minor,
          vp.original_amount_minor,
          vp.active_to
        from product_inventory pi
        left join variant_prices vp
          on vp.product_inventory_id = pi.id
         and vp.active_from <= ?
         and (vp.active_to is null or vp.active_to > ?)
        where pi.product_id in (${placeholders})
      `,
      [new Date(), new Date(), ...productIds],
    );

    const inventoryByProductId = new Map<string, ProductInventoryEntity[]>();

    for (const row of inventoryRows) {
      const productInventories = inventoryByProductId.get(row.product_id) ?? [];
      let inventory = productInventories.find((item) => item.id === row.inventory_id);

      if (!inventory) {
        inventory = createSyntheticInventory(row);
        productInventories.push(inventory);
        inventoryByProductId.set(row.product_id, productInventories);
      }

      if (row.price_id) {
        inventory.prices.getItems().push(createSyntheticPrice(row));
      }
    }

    const allInventories = Array.from(inventoryByProductId.values()).flat();
    const pricingByInventoryId = await this.resolvedStorefrontPriceService.resolveManyForCurrentRequest(
      allInventories,
    );
    const productsById = new Map(productRows.map((row) => [row.id, row] as const));

    const items: Array<PublicProductListItem | null> = productIds
      .map((productId) => {
        const row = productsById.get(productId);

        if (!row) {
          return null;
        }

        const inventories = inventoryByProductId.get(productId) ?? [];
        const totalStock = inventories.reduce((sum, inventory) => sum + inventory.stock, 0);
        const pricing = summarizePricing(
          inventories.map((inventory) => pricingByInventoryId.get(inventory.id) ?? {}),
        );

        return {
          id: row.id,
          shop: {
            id: row.shop_id,
            ...(row.shop_public_id ? { publicId: row.shop_public_id } : {}),
            shopName: row.shop_name,
            slug: row.shop_slug,
          },
          ...(row.category_id ? { categoryId: row.category_id } : {}),
          title: row.title,
          slug: row.slug,
          ...(row.image_storage_key
            ? {
              image: row.card_image_storage_key
                ? {
                  storageKey: row.card_image_storage_key,
                  variant: ProductImageVariant.CARD_1X1,
                  variants: {
                    [ProductImageVariant.CARD_1X1]: {
                      storageKey: row.card_image_storage_key,
                    },
                  },
                }
                : {
                  storageKey: row.image_storage_key,
                  variant: ProductImageVariant.ORIGINAL,
                },
            }
            : {}),
          ...(row.variant_type ? { variantType: row.variant_type } : {}),
          ...(pricing ? { pricing } : {}),
          availability: {
            inStock: totalStock > 0,
            lowStock: totalStock > 0 && totalStock < PRODUCT_STOCK_NOTICE_THRESHOLD,
            stockTotal: totalStock,
          },
          variantCount: row.variant_count,
          ...(row.has_free_shipping ? { hasFreeShipping: true } : {}),
          createdAt: row.created_at,
        };
      });

    return items.filter((product): product is PublicProductListItem => product != null);
  }

  async listPublic(
    input: ListPublicProductsInput,
  ): Promise<PublicProductListResult> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);
    const sortPriceKey = await this.getRequestSortPriceKey();
    const total = await this.countPublicProductIds(entityManager, input, sortPriceKey);
    const canUseDenormalizedPriceSort = this.canUseDenormalizedPriceSort(input.order, sortPriceKey);

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
        }, sortPriceKey)
        : await this.findPublicProductIds(entityManager, input, undefined, sortPriceKey)
      : await this.findPublicProductIds(entityManager, input, {
        limit: input.limit,
        offset: (input.page - 1) * input.limit,
      }, sortPriceKey);

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
          'category',
          'images',
          'images.variants',
          'variants',
          'inventoryRecords',
          'inventoryRecords.prices',
          'inventoryRecords.productVariant',
          'shippingProfiles',
          'shippingProfiles.destinations',
        ],
      },
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
    const pricingByInventoryId = await this.resolvedStorefrontPriceService.resolveManyForCurrentRequest(
      pagedProducts.flatMap((product) => product.inventoryRecords.getItems()),
    );

    return {
      items: await Promise.all(
        pagedProducts.map((product) => toPublicProductListItem(product, {
          resolvePricing: (inventory) =>
            Promise.resolve(pricingByInventoryId.get(inventory.id) ?? {}),
          storageService: this.storageService,
        })),
      ),
      meta: buildPaginationMeta(input.page, input.limit, total),
    };
  }

  async listPublicFacets(
    input: ListPublicProductsInput,
  ): Promise<PublicProductFacet[]> {
    const entityManager = this.entityManager.fork();
    const matchingProductIds = await this.findPublicProductIds(
      entityManager,
      input,
      undefined,
      await this.getRequestSortPriceKey(),
    );

    if (matchingProductIds.length === 0) {
      return [];
    }

    const rows = await entityManager.getConnection().execute<Array<{
      attribute_key: string;
      attribute_name: string;
      option_value: string;
    }>>(
      `
        select
          ca.key as attribute_key,
          ca.name as attribute_name,
          cao.value as option_value
        from product_attribute_values pav
        inner join category_attributes ca on ca.id = pav.category_attribute_id
        inner join category_attribute_options cao on cao.id = pav.selected_option_id
        where pav.product_id in (${matchingProductIds.map(() => '?').join(', ')})
        group by ca.key, ca.name, cao.value
        order by ca.name asc, cao.value asc
      `,
      matchingProductIds,
    );

    const facets = new Map<string, PublicProductFacet>();

    rows.forEach((row) => {
      const facet = facets.get(row.attribute_key) ?? {
        facetKey: row.attribute_key,
        attributeName: row.attribute_name,
        options: [],
      };
      const canonicalOption = toCanonicalFacetOption(row.attribute_key, row.option_value);

      if (!facet.options.some((option) => option.optionKey === canonicalOption.optionKey)) {
        facet.options.push(canonicalOption);
      }

      facets.set(row.attribute_key, facet);
    });

    return Array.from(facets.values()).sort(compareFacetNames);
  }

  async suggestPublic(
    input: SuggestPublicProductsInput,
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
      ],
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
    input: ListPublicProductsInput,
    sortPriceKey?: string,
  ): Promise<number> {
    const { whereClause, params } = this.buildPublicListWhereClause(input, sortPriceKey);
    const rows = await entityManager.getConnection().execute<{ total: string }[]>(
      `
        select count(distinct p.id)::text as total
        from products p
        inner join product_images pi on pi.product_id = p.id
        ${whereClause}
      `,
      params,
    );

    return Number(rows[0]?.total ?? '0');
  }

  private async findPublicProductIds(
    entityManager: EntityManager,
    input: ListPublicProductsInput,
    pagination?: {
      limit: number;
      offset: number;
    },
    sortPriceKey?: string,
  ): Promise<string[]> {
    const { whereClause, params } = this.buildPublicListWhereClause(input, sortPriceKey);
    const { orderByClause, params: orderingParams } = this.buildPublicListOrdering(input, sortPriceKey);
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
      [...params, ...orderingParams],
    );

    return rows.map((row) => row.id);
  }

  private buildPublicListWhereClause(
    input: ListPublicProductsInput,
    sortPriceKey?: string,
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

    if (input.minPriceMinor !== undefined || input.maxPriceMinor !== undefined) {
      const comparablePriceExpression = sortPriceKey
        ? `
            coalesce(
              (p.public_sort_prices ->> ?)::integer,
              (
                select min(vp.amount_minor)
                from product_inventory pi2
                inner join variant_prices vp on vp.product_inventory_id = pi2.id
                where pi2.product_id = p.id
                  and vp.price_type = 'base'
                  and vp.active_to is null
              )
            )
          `
        : `
            (
              select min(vp.amount_minor)
              from product_inventory pi2
              inner join variant_prices vp on vp.product_inventory_id = pi2.id
              where pi2.product_id = p.id
                and vp.price_type = 'base'
                and vp.active_to is null
            )
          `;

      if (input.minPriceMinor !== undefined) {
        clauses.push(`
          and ${comparablePriceExpression} >= ?
        `);
        if (sortPriceKey) {
          params.push(sortPriceKey);
        }
        params.push(input.minPriceMinor);
      }

      if (input.maxPriceMinor !== undefined) {
        clauses.push(`
          and ${comparablePriceExpression} <= ?
        `);
        if (sortPriceKey) {
          params.push(sortPriceKey);
        }
        params.push(input.maxPriceMinor);
      }
    }

    if (input.attributeFilters?.length) {
      input.attributeFilters.forEach((attributeFilter) => {
        if (attributeFilter.attributeId && attributeFilter.selectedOptionIds?.length) {
          clauses.push(`
            and exists (
              select 1
              from product_attribute_values pav
              where pav.product_id = p.id
                and pav.category_attribute_id = ?
                and pav.selected_option_id in (${attributeFilter.selectedOptionIds.map(() => '?').join(', ')})
            )
          `);
          params.push(
            attributeFilter.attributeId,
            ...attributeFilter.selectedOptionIds,
          );
          return;
        }

        if (attributeFilter.attributeId && isInferredFacetSupported(attributeFilter.attributeId)) {
          const inferredTerms = (
            attributeFilter.selectedOptionKeys?.length
              ? attributeFilter.selectedOptionKeys.flatMap((optionKey) =>
                getInferredFacetTerms(attributeFilter.attributeId as never, optionKey),
              )
              : attributeFilter.selectedOptionValues.flatMap((optionValue) =>
                getInferredFacetTerms(
                  attributeFilter.attributeId as never,
                  toFacetKey(optionValue),
                ),
              )
          ).filter(Boolean);

          clauses.push(`
            and (
              exists (
                select 1
                from product_attribute_values pav
                inner join category_attributes ca on ca.id = pav.category_attribute_id
                inner join category_attribute_options cao on cao.id = pav.selected_option_id
                where pav.product_id = p.id
                  and ca.key = ?
                  and ${attributeFilter.selectedOptionKeys?.length
                    ? `${toFacetKeySql('cao.value')} in (${attributeFilter.selectedOptionKeys.map(() => '?').join(', ')})`
                    : `cao.value in (${attributeFilter.selectedOptionValues.map(() => '?').join(', ')})`}
              )
              ${inferredTerms.length > 0
                ? `or (${inferredTerms.map(() => '(lower(p.title) like ? escape \'\\\' or lower(p.description) like ? escape \'\\\')').join(' or ')})`
                : ''}
            )
          `);
          params.push(
            attributeFilter.attributeId,
            ...(attributeFilter.selectedOptionKeys?.length
              ? attributeFilter.selectedOptionKeys
              : attributeFilter.selectedOptionValues),
            ...inferredTerms.flatMap((term) => [`%${this.escapeSearchPattern(term.toLowerCase())}%`, `%${this.escapeSearchPattern(term.toLowerCase())}%`]),
          );
          return;
        }

        clauses.push(`
          and exists (
            select 1
            from product_attribute_values pav
            inner join category_attributes ca on ca.id = pav.category_attribute_id
            inner join category_attribute_options cao on cao.id = pav.selected_option_id
            where pav.product_id = p.id
              and ca.key = ?
              and ${attributeFilter.selectedOptionKeys?.length
                ? `${toFacetKeySql('cao.value')} in (${attributeFilter.selectedOptionKeys.map(() => '?').join(', ')})`
                : `cao.value in (${attributeFilter.selectedOptionValues.map(() => '?').join(', ')})`}
          )
        `);
        params.push(
          attributeFilter.attributeId ?? attributeFilter.attributeName,
          ...(attributeFilter.selectedOptionKeys?.length
            ? attributeFilter.selectedOptionKeys
            : attributeFilter.selectedOptionValues),
        );
      });
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
    input: ListPublicProductsInput,
    sortPriceKey?: string,
  ): { orderByClause: string; params: unknown[] } {
    const normalizedSearch = input.search?.trim().toLowerCase();
    const denormalizedPriceSort = this.getDenormalizedPriceSortOrdering(input.order, sortPriceKey);

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
    order?: ListPublicProductsInput['order'],
    sortPriceKey?: string,
  ): { orderByClause: string; params: unknown[] } | null {
    if (order !== 'price_asc' && order !== 'price_desc') {
      return null;
    }

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
    order?: ListPublicProductsInput['order'],
    sortPriceKey?: string,
  ): boolean {
    return (order === 'price_asc' || order === 'price_desc')
      && sortPriceKey !== undefined;
  }

  private async getRequestSortPriceKey(): Promise<string | undefined> {
    return this.storefrontMarketContextService.getCurrentSortPriceKey();
  }

  private async sortProductsByComparablePrice(
    products: ProductEntity[],
    order: 'price_asc' | 'price_desc',
    page: number,
    limit: number,
  ): Promise<ProductEntity[]> {
    const productsWithComparablePrice = await Promise.all(
      products.map(async product => ({
        product,
        comparablePrice: await this.getComparablePrice(product),
      })),
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

  private async getComparablePrice(product: ProductEntity): Promise<number> {
    const inventory = getPrimaryInventory(product);

    if (!inventory) {
      return Number.POSITIVE_INFINITY;
    }

    const pricing = await this.resolvedStorefrontPriceService.resolveForCurrentRequest(inventory);

    return pricing?.amountMinor ?? Number.POSITIVE_INFINITY;
  }

  private shouldIncludeInPublicList(product: ProductEntity): boolean {
    return product.state === ProductState.ACTIVE && product.images.getItems().length > 0;
  }

  private async getResolvedPublicPricing(
    inventory: ProductInventoryEntity,
  ): Promise<{ amountMinor?: number; originalAmountMinor?: number; currency?: string }> {
    const pricing = await this.resolvedStorefrontPriceService.resolveForCurrentRequest(inventory);

    return {
      amountMinor: pricing?.amountMinor,
      ...(pricing?.originalAmountMinor !== undefined ? { originalAmountMinor: pricing.originalAmountMinor } : {}),
      currency: pricing?.currency,
    };
  }
}

interface ProductCardRow {
  id: string;
  category_id?: string;
  title: string;
  slug: string;
  variant_type?: PublicProductListItem['variantType'];
  created_at: Date;
  shop_id: string;
  shop_public_id?: string;
  shop_name: string;
  shop_slug: string;
  image_storage_key?: string;
  card_image_storage_key?: string;
  variant_count: number;
  has_free_shipping: boolean;
}

interface InventoryPricingRow {
  inventory_id: string;
  product_id: string;
  stock: number;
  inventory_updated_at: Date;
  price_id?: string;
  market_code?: string;
  currency?: string;
  amount_minor?: number;
  original_amount_minor?: number;
  active_to?: Date;
}

function createSyntheticInventory(row: InventoryPricingRow): ProductInventoryEntity {
  const prices: VariantPriceEntity[] = [];

  return {
    id: row.inventory_id,
    stock: row.stock,
    updatedAt: row.inventory_updated_at,
    prices: {
      getItems: () => prices,
    },
  } as ProductInventoryEntity;
}

function createSyntheticPrice(row: InventoryPricingRow): VariantPriceEntity {
  return {
    id: row.price_id,
    marketCode: row.market_code,
    currency: row.currency,
    amountMinor: row.amount_minor,
    originalAmountMinor: row.original_amount_minor,
    activeTo: row.active_to,
  } as VariantPriceEntity;
}

function summarizePricing(
  pricingRows: Array<{
    amountMinor?: number;
    originalAmountMinor?: number;
    currency?: string;
  }>,
): PublicProductListItem['pricing'] | undefined {
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

function toFacetKeySql(expression: string): string {
  return `trim(both '_' from regexp_replace(lower(${expression}), '[^a-z0-9]+', '_', 'g'))`;
}
