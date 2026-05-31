import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { buildPaginationMeta } from '~/common/application/pagination';
import { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
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
  ReplaceProductAttributeValuesRepositoryInput,
  ReplaceProductImagesRepositoryInput,
  ReplaceProductImagesRepositoryResult,
  ReplaceProductInventoryRepositoryInput,
  ReplaceProductShippingRepositoryInput,
  ReplaceProductVariantsRepositoryInput,
  ShopProductListResult,
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
  VariantPriceEntity,
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
    };
  }

  async listPublic(
    input: ListPublicProductsInput
  ): Promise<PublicProductListResult> {
    const repository = this.entityManager.fork().getRepository(ProductEntity);
    const products = await repository.find(
      {
        state: ProductState.ACTIVE,
        ...(input.categoryIds?.length
          ? { category: { $in: input.categoryIds } }
          : {}),
        ...(input.isDigital !== undefined ? { isDigital: input.isDigital } : {}),
        ...(input.whoMade ? { whoMade: input.whoMade } : {}),
      },
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

    const normalizedSearch = input.search?.trim().toLowerCase();
    const normalizedTitle = input.title?.trim().toLowerCase();

    const filteredProducts = products.filter((product) => {
      if (normalizedSearch) {
        const haystack = `${product.title} ${product.description}`.toLowerCase();

        if (!haystack.includes(normalizedSearch)) {
          return false;
        }
      }

      if (normalizedTitle && !product.title.toLowerCase().includes(normalizedTitle)) {
        return false;
      }

      return true;
    });

    const productsWithComparablePrice = await Promise.all(
      filteredProducts.map(async product => ({
        product,
        comparablePrice: await this.getComparablePrice(product),
      })),
    );

    const sortedProducts = productsWithComparablePrice.sort((left, right) => {
      if (input.order === 'price_asc' || input.order === 'price_desc') {
        if (left.comparablePrice !== right.comparablePrice) {
          return input.order === 'price_asc'
            ? left.comparablePrice - right.comparablePrice
            : right.comparablePrice - left.comparablePrice;
        }
      }

      return right.product.createdAt.getTime() - left.product.createdAt.getTime();
    });

    const total = sortedProducts.length;
    const start = (input.page - 1) * input.limit;
    const pagedProducts = sortedProducts.slice(start, start + input.limit);

    return {
      items: await Promise.all(pagedProducts.map(({ product }) => this.toPublicListItem(product))),
      meta: buildPaginationMeta(input.page, input.limit, total),
    };
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
        entityManager.persist(entityManager.create(VariantPriceEntity, {
          productInventory: inventoryEntity,
          priceType: VARIANT_PRICE_TYPES.BASE,
          activeFrom: new Date(),
          amountMinor: preservedPrice.amountMinor,
          originalAmountMinor: preservedPrice.originalAmountMinor,
          currency: preservedPrice.currency,
        }));
      }
    }

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
        })),
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
    inventory: ProductInventoryEntity,
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
        url: this.storageService.getPublicUrl(cardVariant.storageKey),
        variant: cardVariant.variant,
        variants: {
          [cardVariant.variant]: {
            storageKey: cardVariant.storageKey,
            url: this.storageService.getPublicUrl(cardVariant.storageKey),
          },
        },
      };
    }

    return {
      storageKey: primaryImage.storageKey,
      url: this.storageService.getPublicUrl(primaryImage.storageKey),
      variant: 'original',
    };
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

function buildInventoryKey(productVariantId?: string): string {
  return productVariantId ?? '__no_variant__';
}
