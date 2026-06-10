import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { buildPaginationMeta } from '~/common/application/pagination';
import { MARKETPLACE_MARKETS } from '~/config/marketplace.config';
import { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import { RequestContextService } from '~/modules/shared/request-context/request-context.service';
import { CategoryAttributeOptionEntity } from '~/modules/domains/category/infra/persistence/entities/category-attribute-option.entity';
import { CategoryAttributeEntity } from '~/modules/domains/category/infra/persistence/entities/category-attribute.entity';
import { CategoryEntity } from '~/modules/domains/category/infra/persistence/entities/category.entity';
import { ShopEntity } from '~/modules/domains/shop/infra/persistence/entities/shop.entity';
import { ProductState } from '../domain/enums/product-state.enum';
import { ProductImageVariant } from '../domain/enums/product-image-variant.enum';
import { ProductImageVariantStatus } from '../domain/enums/product-image-variant-status.enum';
import { ProductRepository } from '../app/ports/product.repository';
import type {
  CreateProductDraftRepositoryInput,
  ListShopProductsInput,
  ListPublicProductsInput,
  PublicProductDetail,
  ProductDraftSummary,
  PublicProductListItem,
  PublicProductListResult,
  PublicProductSuggestion,
  ReplaceProductAttributeValuesRepositoryInput,
  ReplaceProductImagesRepositoryInput,
  ReplaceProductImagesRepositoryResult,
  ReplaceProductInventoryRepositoryInput,
  ReplaceProductShippingRepositoryInput,
  ReplaceProductVariantsRepositoryInput,
  ShopProductListResult,
  SuggestPublicProductsInput,
  UpdateProductDetailsRepositoryInput
} from '../app/product.types';
import { ProductImageEntity } from './persistence/entities/product-image.entity';
import { ProductAttributeValueEntity } from './persistence/entities/product-attribute-value.entity';
import { ProductInventoryEntity } from './persistence/entities/product-inventory.entity';
import { ProductEntity } from './persistence/entities/product.entity';
import { ProductShippingDestinationEntity } from './persistence/entities/product-shipping-destination.entity';
import { ProductShippingProfileEntity } from './persistence/entities/product-shipping-profile.entity';
import { ProductVariantEntity } from './persistence/entities/product-variant.entity';
import {
  VARIANT_PRICE_TYPES,
  VariantPriceEntity
} from './persistence/entities/variant-price.entity';
import { ResolvedStorefrontPriceService } from '../app/services/resolved-storefront-price.service';
import { getInventoryPricingSnapshot } from './variant-price-read';

@Injectable()
export class MikroOrmProductRepository implements ProductRepository {
  private static readonly summaryPopulate = [
    'shop',
    'category',
    'images',
    'images.variants',
    'attributeValues',
    'attributeValues.categoryAttribute',
    'attributeValues.selectedOption',
    'variants',
    'inventoryRecords',
    'inventoryRecords.productVariant',
    'inventoryRecords.prices',
    'shippingProfiles',
    'shippingProfiles.destinations',
  ] as const;

  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService,
    private readonly resolvedStorefrontPriceService: ResolvedStorefrontPriceService,
    private readonly requestContextService: RequestContextService
  ) {}

  async findById(id: string): Promise<ProductDraftSummary | null> {
    const repository = this.entityManager.fork().getRepository(ProductEntity);
    const product = await repository.findOne(
      { id },
      {
        populate: [...MikroOrmProductRepository.summaryPopulate],
      }
    );

    return product ? this.toDraftSummary(product) : null;
  }

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
        populate: [...MikroOrmProductRepository.summaryPopulate],
      }
    );

    return product ? this.toPublicDetail(product) : null;
  }

  async listByShop(
    input: ListShopProductsInput
  ): Promise<ShopProductListResult> {
    const repository = this.entityManager.fork().getRepository(ProductEntity);
    const products = await repository.find(
      {
        shop: input.shopId,
        ...(input.state ? { state: input.state } : {}),
        ...(input.categoryId ? { category: input.categoryId } : {}),
      },
      {
        populate: [...MikroOrmProductRepository.summaryPopulate],
      }
    );

    const normalizedSearch = input.search?.trim().toLowerCase();
    const filteredProducts = products.filter((product) => {
      if (!this.shouldIncludeInShopList(product.state, input.state)) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = `${product.title} ${product.slug} ${product.description}`
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });

    const sortedProducts = filteredProducts.sort(
      (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()
    );
    const total = sortedProducts.length;
    const start = (input.page - 1) * input.limit;
    const pagedProducts = sortedProducts.slice(start, start + input.limit);

    return {
      items: pagedProducts.map((product) => this.toDraftSummary(product)),
      meta: buildPaginationMeta(input.page, input.limit, total),
      stateCounts: {
        all: total,
        active: input.state === ProductState.ACTIVE ? total : 0,
        inactive: input.state === ProductState.INACTIVE ? total : 0,
        draft: input.state === ProductState.DRAFT ? total : 0,
      },
    };
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

    const pagedProducts = input.order === 'price_asc' || input.order === 'price_desc'
      && !canUseDenormalizedPriceSort
      ? await this.sortProductsByComparablePrice(orderedProducts, input.order, input.page, input.limit)
      : orderedProducts;

    return {
      items: await Promise.all(pagedProducts.map(product => this.toPublicListItem(product))),
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

  async replaceImages(
    input: ReplaceProductImagesRepositoryInput
  ): Promise<ReplaceProductImagesRepositoryResult | null> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);
    const product = await repository.findOne(
      { id: input.productId },
      {
        populate: [...MikroOrmProductRepository.summaryPopulate],
      }
    );

    if (!product) {
      return null;
    }

    const removedStorageKeys = product.images
      .getItems()
      .flatMap((image) => [
        image.storageKey,
        ...image.variants.getItems().map((variant) => variant.storageKey),
      ]);

    for (const image of product.images.getItems()) {
      entityManager.remove(image);
    }

    product.images.removeAll();

    for (const image of input.images) {
      const imageEntity = entityManager.create(ProductImageEntity, {
        product,
        storageKey: image.storageKey,
        rank: image.rank,
        variantStatus: ProductImageVariantStatus.PENDING,
      });
      product.images.add(imageEntity);
      entityManager.persist(imageEntity);
    }

    await entityManager.persistAndFlush(product);

    return {
      product: this.toDraftSummary(product),
      removedStorageKeys,
    };
  }

  async replaceAttributeValues(
    input: ReplaceProductAttributeValuesRepositoryInput
  ): Promise<ProductDraftSummary | null> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);
    const product = await repository.findOne(
      { id: input.productId },
      {
        populate: [...MikroOrmProductRepository.summaryPopulate],
      }
    );

    if (!product) {
      return null;
    }

    for (const attributeValue of product.attributeValues.getItems()) {
      entityManager.remove(attributeValue);
    }

    product.attributeValues.removeAll();

    for (const attributeValue of input.attributes) {
      const attributeValueEntity = entityManager.create(
        ProductAttributeValueEntity,
        {
          product,
          categoryAttribute: entityManager.getReference(
            CategoryAttributeEntity,
            attributeValue.categoryAttributeId
          ),
          selectedOption: attributeValue.selectedOptionId
            ? entityManager.getReference(
              CategoryAttributeOptionEntity,
              attributeValue.selectedOptionId
            )
            : undefined,
          selectedText: attributeValue.selectedText,
        }
      );

      product.attributeValues.add(attributeValueEntity);
      entityManager.persist(attributeValueEntity);
    }

    await entityManager.persistAndFlush(product);
    await entityManager.populate(product, [
      'attributeValues',
      'attributeValues.categoryAttribute',
      'attributeValues.selectedOption',
    ]);

    return this.toDraftSummary(product);
  }

  async replaceVariants(
    input: ReplaceProductVariantsRepositoryInput
  ): Promise<ProductDraftSummary | null> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);
    const product = await repository.findOne(
      { id: input.productId },
      {
        populate: [...MikroOrmProductRepository.summaryPopulate],
      }
    );

    if (!product) {
      return null;
    }

    for (const variant of product.variants.getItems()) {
      entityManager.remove(variant);
    }

    product.variants.removeAll();

    for (const variant of input.variants) {
      const variantEntity = entityManager.create(ProductVariantEntity, {
        product,
        name: variant.name,
        optionValue1: variant.optionValue1,
        optionValue2: variant.optionValue2,
        rank: variant.rank,
      });
      product.variants.add(variantEntity);
      entityManager.persist(variantEntity);
    }

    await entityManager.persistAndFlush(product);
    await entityManager.populate(product, ['shop']);

    return this.toDraftSummary(product);
  }

  async replaceInventory(
    input: ReplaceProductInventoryRepositoryInput
  ): Promise<ProductDraftSummary | null> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);
    const product = await repository.findOne(
      { id: input.productId },
      {
        populate: [...MikroOrmProductRepository.summaryPopulate],
      }
    );

    if (!product) {
      return null;
    }

    const existingPriceByInventoryKey = new Map<string, {
      amountMinor: number;
      originalAmountMinor?: number;
      currency: string;
    }>();

    for (const inventoryRecord of product.inventoryRecords.getItems()) {
      const pricing = getInventoryPricingSnapshot(inventoryRecord);
      if (!pricing) {
        continue;
      }

      existingPriceByInventoryKey.set(
        buildInventoryKey(inventoryRecord.productVariant?.id),
        {
          amountMinor: pricing.amountMinor,
          originalAmountMinor: pricing.originalAmountMinor,
          currency: pricing.currency,
        }
      );
    }

    for (const inventoryRecord of product.inventoryRecords.getItems()) {
      entityManager.remove(inventoryRecord);
    }

    product.inventoryRecords.removeAll();

    for (const row of input.inventory) {
      const preservedPrice = existingPriceByInventoryKey.get(
        buildInventoryKey(row.productVariantId)
      );
      const inventoryEntity = entityManager.create(ProductInventoryEntity, {
        shop: entityManager.getReference(ShopEntity, input.shopId),
        product,
        productVariant: row.productVariantId
          ? entityManager.getReference(ProductVariantEntity, row.productVariantId)
          : undefined,
        sku: row.sku,
        stock: row.stock,
      });
      product.inventoryRecords.add(inventoryEntity);
      entityManager.persist(inventoryEntity);

      if (preservedPrice) {
        const preservedPriceEntity = entityManager.create(VariantPriceEntity, {
          productInventory: inventoryEntity,
          priceType: VARIANT_PRICE_TYPES.BASE,
          activeFrom: new Date(),
          amountMinor: preservedPrice.amountMinor,
          originalAmountMinor: preservedPrice.originalAmountMinor,
          currency: preservedPrice.currency,
        });
        inventoryEntity.prices.add(preservedPriceEntity);
        entityManager.persist(preservedPriceEntity);
      }
    }

    await this.refreshPublicSortPrices(product);
    await entityManager.persistAndFlush(product);

    return this.toDraftSummary(product);
  }

  async replacePricing(input: {
    productId: string;
    pricing: Array<{
      inventoryId: string;
      amountMinor: number;
      originalAmountMinor?: number;
      currency: string;
    }>;
  }): Promise<ProductDraftSummary | null> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);
    const product = await repository.findOne(
      { id: input.productId },
      {
        populate: [...MikroOrmProductRepository.summaryPopulate],
      }
    );

    if (!product) {
      return null;
    }

    const pricingByInventoryId = new Map(
      input.pricing.map((row) => [row.inventoryId, row])
    );

    const pendingBasePrices: VariantPriceEntity[] = [];

    for (const inventoryRecord of product.inventoryRecords.getItems()) {
      const nextPricing = pricingByInventoryId.get(inventoryRecord.id);

      if (!nextPricing) {
        continue;
      }

      for (const existingPrice of inventoryRecord.prices.getItems()) {
        if (!existingPrice.marketCode && !existingPrice.activeTo) {
          existingPrice.activeTo = new Date();
        }
      }
    }

    await entityManager.flush();

    for (const inventoryRecord of product.inventoryRecords.getItems()) {
      const nextPricing = pricingByInventoryId.get(inventoryRecord.id);

      if (!nextPricing) {
        continue;
      }

      const canonicalBasePrice = entityManager.create(VariantPriceEntity, {
        productInventory: inventoryRecord,
        priceType: VARIANT_PRICE_TYPES.BASE,
        activeFrom: new Date(),
        amountMinor: nextPricing.amountMinor,
        originalAmountMinor: nextPricing.originalAmountMinor,
        currency: nextPricing.currency,
      });

      inventoryRecord.prices.add(canonicalBasePrice);
      pendingBasePrices.push(canonicalBasePrice);
    }

    entityManager.persist(pendingBasePrices);
    await this.refreshPublicSortPrices(product);
    await entityManager.persistAndFlush(product);

    return this.toDraftSummary(product);
  }

  async replaceShipping(
    input: ReplaceProductShippingRepositoryInput
  ): Promise<ProductDraftSummary | null> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);
    const product = await repository.findOne(
      { id: input.productId },
      {
        populate: [...MikroOrmProductRepository.summaryPopulate],
      }
    );

    if (!product) {
      return null;
    }

    for (const shippingProfile of product.shippingProfiles.getItems()) {
      for (const destination of shippingProfile.destinations.getItems()) {
        entityManager.remove(destination);
      }
      entityManager.remove(shippingProfile);
    }

    product.shippingProfiles.removeAll();

    const shippingProfile = entityManager.create(ProductShippingProfileEntity, {
      product,
      shop: entityManager.getReference(ShopEntity, input.shopId),
      originCountry: input.shipping.originCountry,
      originZip: input.shipping.originZip,
      processTimeLabel: input.shipping.processTimeLabel,
    });

    for (const destination of input.shipping.destinations) {
      const destinationEntity = entityManager.create(
        ProductShippingDestinationEntity,
        {
          shippingProfile,
          countryCode: destination.countryCode,
          deliveryTimeLabel: destination.deliveryTimeLabel,
          service: destination.service,
          chargeType: destination.chargeType,
          rank: destination.rank,
        }
      );
      shippingProfile.destinations.add(destinationEntity);
      entityManager.persist(destinationEntity);
    }

    product.shippingProfiles.add(shippingProfile);
    entityManager.persist(shippingProfile);

    await entityManager.persistAndFlush(product);

    return this.toDraftSummary(product);
  }

  async updateDetails(
    input: UpdateProductDetailsRepositoryInput
  ): Promise<ProductDraftSummary | null> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);
    const product = await repository.findOne(
      { id: input.productId },
      {
        populate: [...MikroOrmProductRepository.summaryPopulate],
      }
    );

    if (!product) {
      return null;
    }

    product.title = input.title;
    product.slug = input.slug;
    product.description = input.description;
    product.whoMade = input.whoMade;
    product.isDigital = input.isDigital;
    product.nonTaxable = input.nonTaxable;
    product.variantGroupName = input.variantGroupName;
    product.variantSubGroupName = input.variantSubGroupName;

    await entityManager.persistAndFlush(product);

    return this.toDraftSummary(product);
  }

  async updateState(
    productId: string,
    state: ProductDraftSummary['state']
  ): Promise<ProductDraftSummary | null> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);
    const product = await repository.findOne(
      { id: productId },
      {
        populate: [...MikroOrmProductRepository.summaryPopulate],
      }
    );

    if (!product) {
      return null;
    }

    product.state = state;

    await entityManager.persistAndFlush(product);

    return this.toDraftSummary(product);
  }

  async publish(productId: string): Promise<ProductDraftSummary | null> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);
    const product = await repository.findOne(
      { id: productId },
      {
        populate: [...MikroOrmProductRepository.summaryPopulate],
      }
    );

    if (!product) {
      return null;
    }

    product.state = ProductState.ACTIVE;
    product.publishedAt = product.publishedAt ?? new Date();

    await entityManager.persistAndFlush(product);

    return this.toDraftSummary(product);
  }

  async createDraft(
    input: CreateProductDraftRepositoryInput
  ): Promise<ProductDraftSummary> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);

    const product = repository.create({
      shop: entityManager.getReference(ShopEntity, input.shopId),
      category: input.categoryId
        ? entityManager.getReference(CategoryEntity, input.categoryId)
        : undefined,
      title: input.title,
      slug: input.slug,
      description: input.description,
      state: ProductState.DRAFT,
      whoMade: input.whoMade,
      isDigital: input.isDigital,
      nonTaxable: input.nonTaxable,
      variantType: input.variantType,
      variantGroupName: input.variantGroupName,
      variantSubGroupName: input.variantSubGroupName,
      publicSortPrices: {},
      views: 0,
      ratingAverage: 0,
    });

    await entityManager.persistAndFlush(product);

    return this.toDraftSummary(product);
  }

  async findByShopIdAndSlug(
    shopId: string,
    slug: string
  ): Promise<ProductDraftSummary | null> {
    const repository = this.entityManager.fork().getRepository(ProductEntity);
    const product = await repository.findOne(
      { shop: shopId, slug },
      {
        populate: [...MikroOrmProductRepository.summaryPopulate],
      }
    );

    return product ? this.toDraftSummary(product) : null;
  }

  private shouldIncludeInShopList(
    productState: ProductState,
    requestedState?: ProductState
  ): boolean {
    if (requestedState) {
      return productState === requestedState;
    }

    return productState !== ProductState.REMOVED;
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

  private async refreshPublicSortPrices(product: ProductEntity): Promise<void> {
    const primaryInventory = this.getPrimaryInventory(product);

    if (!primaryInventory) {
      product.publicSortPrices = {};
      return;
    }

    const publicSortPrices = await Promise.all(
      MARKETPLACE_MARKETS
        .filter((market) => market.enabled)
        .map(async (market) => {
          const pricing = await this.resolvedStorefrontPriceService.resolve(primaryInventory, {
            marketCode: market.code,
            currency: market.defaultCurrency,
          });

          return pricing
            ? [`${market.code}:${market.defaultCurrency}`, pricing.amountMinor] as const
            : null;
        })
    );

    product.publicSortPrices = publicSortPrices.reduce<Record<string, number>>((accumulator, entry) => {
      if (!entry) {
        return accumulator;
      }

      const [key, amountMinor] = entry;
      accumulator[key] = amountMinor;
      return accumulator;
    }, {});
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

  private toDraftSummary(product: ProductEntity): ProductDraftSummary {
    return {
      id: product.id,
      publicId: product.publicId,
      shopId: product.shop.id,
      shopPublicId: product.shop.publicId,
      categoryId: product.category?.id,
      title: product.title,
      slug: product.slug,
      description: product.description,
      state: product.state,
      whoMade: product.whoMade,
      isDigital: product.isDigital,
      nonTaxable: product.nonTaxable,
      variantType: product.variantType,
      variantGroupName: product.variantGroupName,
      variantSubGroupName: product.variantSubGroupName,
      images: product.images
        .getItems()
        .sort((left, right) => left.rank - right.rank)
        .map((image) => ({
          id: image.id,
          storageKey: image.storageKey,
          url: this.storageService.getPublicUrl(image.storageKey),
          rank: image.rank,
          variantStatus: image.variantStatus,
          variantError: image.variantError,
          variantsGeneratedAt: image.variantsGeneratedAt,
          variants: image.variants
            .getItems()
            .map((variant) => ({
              id: variant.id,
              variant: variant.variant,
              storageKey: variant.storageKey,
              url: this.storageService.getPublicUrl(variant.storageKey),
              width: variant.width,
              height: variant.height,
              format: variant.format,
            })),
        })),
      attributes: product.attributeValues
        .getItems()
        .sort(
          (left, right) => left.categoryAttribute.rank - right.categoryAttribute.rank
        )
        .map((attributeValue) => ({
          id: attributeValue.id,
          categoryAttributeId: attributeValue.categoryAttribute.id,
          categoryAttributeName: attributeValue.categoryAttribute.name,
          inputType: attributeValue.categoryAttribute.inputType,
          selectedOptionId: attributeValue.selectedOption?.id,
          selectedOptionValue: attributeValue.selectedOption?.value,
          selectedText: attributeValue.selectedText,
        })),
      variants: product.variants
        .getItems()
        .sort((left, right) => left.rank - right.rank)
        .map((variant) => ({
          id: variant.id,
          name: variant.name,
          optionValue1: variant.optionValue1,
          optionValue2: variant.optionValue2,
          imageStorageKey: variant.imageStorageKey,
          rank: variant.rank,
        })),
      inventory: product.inventoryRecords
        .getItems()
        .sort((left, right) => {
          if (!left.productVariant && !right.productVariant) {
            return 0;
          }
          if (!left.productVariant) {
            return -1;
          }
          if (!right.productVariant) {
            return 1;
          }
          return left.productVariant.rank - right.productVariant.rank;
        })
        .map((inventoryRecord) => ({
          id: inventoryRecord.id,
          productVariantId: inventoryRecord.productVariant?.id,
          sku: inventoryRecord.sku,
          stock: inventoryRecord.stock,
          ...this.getSummaryPricing(inventoryRecord),
        })),
      shipping: product.shippingProfiles.length > 0
        ? {
          id: product.shippingProfiles[0].id,
          originCountry: product.shippingProfiles[0].originCountry,
          originZip: product.shippingProfiles[0].originZip,
          processTimeLabel: product.shippingProfiles[0].processTimeLabel,
          destinations: product.shippingProfiles[0].destinations
            .getItems()
            .sort((left, right) => left.rank - right.rank)
            .map((destination) => ({
              id: destination.id,
              countryCode: destination.countryCode,
              deliveryTimeLabel: destination.deliveryTimeLabel,
              service: destination.service,
              chargeType: destination.chargeType,
              rank: destination.rank,
            })),
        }
        : undefined,
    };
  }

  private async toPublicDetail(product: ProductEntity): Promise<PublicProductDetail> {
    const inventory = await Promise.all(
      product.inventoryRecords
        .getItems()
        .sort((left, right) => {
          if (!left.productVariant && !right.productVariant) {
            return 0;
          }
          if (!left.productVariant) {
            return -1;
          }
          if (!right.productVariant) {
            return 1;
          }
          return left.productVariant.rank - right.productVariant.rank;
        })
        .map(async (inventoryRecord) => ({
          id: inventoryRecord.id,
          productVariantId: inventoryRecord.productVariant?.id,
          sku: inventoryRecord.sku,
          stock: inventoryRecord.stock,
          ...(await this.getResolvedPublicPricing(inventoryRecord)),
        }))
    );

    return {
      id: product.id,
      shop: {
        id: product.shop.id,
        publicId: product.shop.publicId,
        shopName: product.shop.shopName,
        slug: product.shop.slug,
      },
      categoryId: product.category?.id,
      title: product.title,
      slug: product.slug,
      description: product.description,
      whoMade: product.whoMade,
      isDigital: product.isDigital,
      variantType: product.variantType,
      variantGroupName: product.variantGroupName,
      variantSubGroupName: product.variantSubGroupName,
      images: product.images
        .getItems()
        .sort((left, right) => left.rank - right.rank)
        .map((image) => ({
          id: image.id,
          storageKey: image.storageKey,
          url: this.storageService.getPublicUrl(image.storageKey),
          rank: image.rank,
          variantStatus: image.variantStatus,
          variantError: image.variantError,
          variantsGeneratedAt: image.variantsGeneratedAt,
          variants: image.variants
            .getItems()
            .map((variant) => ({
              id: variant.id,
              variant: variant.variant,
              storageKey: variant.storageKey,
              url: this.storageService.getPublicUrl(variant.storageKey),
              width: variant.width,
              height: variant.height,
              format: variant.format,
            })),
        })),
      variants: product.variants
        .getItems()
        .sort((left, right) => left.rank - right.rank)
        .map((variant) => ({
          id: variant.id,
          name: variant.name,
          optionValue1: variant.optionValue1,
          optionValue2: variant.optionValue2,
          imageStorageKey: variant.imageStorageKey,
          rank: variant.rank,
        })),
      inventory,
      shipping: product.shippingProfiles.length > 0
        ? {
          originCountry: product.shippingProfiles[0].originCountry,
          processTimeLabel: product.shippingProfiles[0].processTimeLabel,
          destinations: product.shippingProfiles[0].destinations
            .getItems()
            .sort((left, right) => left.rank - right.rank)
            .map((destination) => ({
              id: destination.id,
              countryCode: destination.countryCode,
              deliveryTimeLabel: destination.deliveryTimeLabel,
              service: destination.service,
              chargeType: destination.chargeType,
              rank: destination.rank,
            })),
        }
        : undefined,
    };
  }

  private async toPublicListItem(product: ProductEntity): Promise<PublicProductListItem> {
    const primaryImage = product.images
      .getItems()
      .slice()
      .sort((left, right) => left.rank - right.rank)[0];
    const primaryInventory = this.getPrimaryInventory(product);
    const resolvedPricing = primaryInventory
      ? await this.getResolvedPublicPricing(primaryInventory)
      : undefined;

    return {
      id: product.id,
      shop: {
        id: product.shop.id,
        publicId: product.shop.publicId,
        shopName: product.shop.shopName,
        slug: product.shop.slug,
      },
      categoryId: product.category?.id,
      title: product.title,
      slug: product.slug,
      image: primaryImage
        ? this.toPublicListImage(primaryImage)
        : undefined,
      variantType: product.variantType,
      inventory: primaryInventory
        ? {
          ...resolvedPricing,
          stock: primaryInventory.stock,
          sku: primaryInventory.sku,
        }
        : undefined,
      createdAt: product.createdAt,
    };
  }

  private async getComparablePrice(product: ProductEntity): Promise<number> {
    const inventory = this.getPrimaryInventory(product);

    if (!inventory) {
      return Number.POSITIVE_INFINITY;
    }

    const pricing = await this.resolvedStorefrontPriceService.resolveForCurrentRequest(inventory);

    return pricing?.amountMinor ?? Number.POSITIVE_INFINITY;
  }

  private getPrimaryInventory(product: ProductEntity): ProductInventoryEntity | undefined {
    return product.inventoryRecords
      .getItems()
      .slice()
      .sort((left, right) => {
        if (!left.productVariant && !right.productVariant) {
          return 0;
        }

        if (!left.productVariant) {
          return -1;
        }

        if (!right.productVariant) {
          return 1;
        }

        return left.productVariant.rank - right.productVariant.rank;
      })[0];
  }

  private getSummaryPricing(
    inventory: ProductInventoryEntity
  ): { amountMinor?: number; originalAmountMinor?: number; currency?: string } {
    const pricing = getInventoryPricingSnapshot(inventory);

    return {
      amountMinor: pricing?.amountMinor,
      ...(pricing?.originalAmountMinor !== undefined ? { originalAmountMinor: pricing.originalAmountMinor } : {}),
      currency: pricing?.currency,
    };
  }

  private toPublicListImage(primaryImage: ProductImageEntity): PublicProductListItem['image'] {
    const cardVariant = primaryImage.variants
      .getItems()
      .find((variant) => variant.variant === ProductImageVariant.CARD_1X1);

    if (cardVariant) {
      return {
        storageKey: cardVariant.storageKey,
        variant: cardVariant.variant,
        variants: {
          [cardVariant.variant]: {
            storageKey: cardVariant.storageKey,
          },
        },
      };
    }

    return {
      storageKey: primaryImage.storageKey,
      variant: 'original',
    };
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

function buildInventoryKey(productVariantId?: string): string {
  return productVariantId ?? '__no_variant__';
}
