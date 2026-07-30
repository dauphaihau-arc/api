import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { MARKETPLACE_MARKETS } from '~/platform/config/marketplace.config';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { ProductCommandRepository } from '../../../../app/ports/product-command.repository';
import { ProductPricingRepository } from '../../../../app/ports/product-pricing.repository';
import { ResolvedStorefrontPriceService } from '../../../../app/services/resolved-storefront-price.service';
import type {
  CreateProductDraftRepositoryInput,
  ProductDraftSummary,
  ReplaceProductAttributeValuesRepositoryInput,
  ReplaceProductImagesRepositoryInput,
  ReplaceProductImagesRepositoryResult,
  ReplaceProductInventoryRepositoryInput,
  ReplaceProductShippingRepositoryInput,
  ReplaceProductVariantsRepositoryInput,
  UpdateProductDetailsRepositoryInput,
} from '../../../../app/product.types';
import { ProductImageVariantStatus } from '../../../../domain/enums/product-image-variant-status.enum';
import { ProductState } from '../../../../domain/enums/product-state.enum';
import { CategoryAttributeOptionEntity } from '~/domains/category/infra/persistence/entities/category-attribute-option.entity';
import { CategoryAttributeEntity } from '~/domains/category/infra/persistence/entities/category-attribute.entity';
import { CategoryEntity } from '~/domains/category/infra/persistence/entities/category.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { ProductAttributeValueEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-attribute-value.entity';
import { ProductImageEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-image.entity';
import { ProductInventoryEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ProductShippingDestinationEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-shipping-destination.entity';
import { ProductShippingProfileEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-shipping-profile.entity';
import { ProductVariantEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-variant.entity';
import { VARIANT_PRICE_TYPES, VariantPriceEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/variant-price.entity';
import { getInventoryPricingSnapshot } from '../reads/variant-price-read';
import { toProductDraftSummary } from '../../../projection/product-draft-summary.projector';

@Injectable()
export class MikroOrmProductCommandRepository
implements ProductCommandRepository, ProductPricingRepository {
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

  async replaceImages(
    input: ReplaceProductImagesRepositoryInput,
  ): Promise<ReplaceProductImagesRepositoryResult | null> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);
    const product = await repository.findOne(
      { id: input.productId },
      { populate: [...MikroOrmProductCommandRepository.summaryPopulate] },
    );
    if (!product) return null;

    const removedStorageKeys = product.images.getItems().flatMap((image) => [
      image.storageKey,
      ...image.variants.getItems().map((variant) => variant.storageKey),
    ]);

    for (const image of product.images.getItems()) entityManager.remove(image);
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
    return { product: toProductDraftSummary(product, this.storageService), removedStorageKeys };
  }

  async replaceAttributeValues(
    input: ReplaceProductAttributeValuesRepositoryInput,
  ): Promise<ProductDraftSummary | null> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);
    const product = await repository.findOne(
      { id: input.productId },
      { populate: [...MikroOrmProductCommandRepository.summaryPopulate] },
    );
    if (!product) return null;

    for (const attributeValue of product.attributeValues.getItems()) entityManager.remove(attributeValue);
    product.attributeValues.removeAll();

    for (const attributeValue of input.attributes) {
      const attributeValueEntity = entityManager.create(ProductAttributeValueEntity, {
        product,
        categoryAttribute: entityManager.getReference(CategoryAttributeEntity, attributeValue.categoryAttributeId),
        selectedOption: attributeValue.selectedOptionId
          ? entityManager.getReference(CategoryAttributeOptionEntity, attributeValue.selectedOptionId)
          : undefined,
        selectedText: attributeValue.selectedText,
      });
      product.attributeValues.add(attributeValueEntity);
      entityManager.persist(attributeValueEntity);
    }

    await entityManager.persistAndFlush(product);
    await entityManager.populate(product, ['attributeValues', 'attributeValues.categoryAttribute', 'attributeValues.selectedOption']);
    return toProductDraftSummary(product, this.storageService);
  }

  async replaceVariants(input: ReplaceProductVariantsRepositoryInput): Promise<ProductDraftSummary | null> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);
    const product = await repository.findOne(
      { id: input.productId },
      { populate: [...MikroOrmProductCommandRepository.summaryPopulate] },
    );
    if (!product) return null;

    for (const variant of product.variants.getItems()) entityManager.remove(variant);
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
    return toProductDraftSummary(product, this.storageService);
  }

  async replaceInventory(input: ReplaceProductInventoryRepositoryInput): Promise<ProductDraftSummary | null> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);
    const product = await repository.findOne(
      { id: input.productId },
      { populate: [...MikroOrmProductCommandRepository.summaryPopulate] },
    );
    if (!product) return null;

    const existingPriceByInventoryKey = new Map<string, { amountMinor: number; originalAmountMinor?: number; currency: string }>();
    for (const inventoryRecord of product.inventoryRecords.getItems()) {
      const pricing = getInventoryPricingSnapshot(inventoryRecord);
      if (!pricing) continue;
      existingPriceByInventoryKey.set(buildInventoryKey(inventoryRecord.productVariant?.id), {
        amountMinor: pricing.amountMinor,
        originalAmountMinor: pricing.originalAmountMinor,
        currency: pricing.currency,
      });
    }

    for (const inventoryRecord of product.inventoryRecords.getItems()) entityManager.remove(inventoryRecord);
    product.inventoryRecords.removeAll();

    for (const row of input.inventory) {
      const preservedPrice = existingPriceByInventoryKey.get(buildInventoryKey(row.productVariantId));
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
    return toProductDraftSummary(product, this.storageService);
  }

  async replacePricing(input: {
    productId: string;
    pricing: Array<{
      inventoryId: string; amountMinor: number; originalAmountMinor?: number; currency: string 
    }>;
  }): Promise<ProductDraftSummary | null> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);
    const product = await repository.findOne(
      { id: input.productId },
      { populate: [...MikroOrmProductCommandRepository.summaryPopulate] },
    );
    if (!product) return null;

    const pricingByInventoryId = new Map(input.pricing.map((row) => [row.inventoryId, row]));
    const pendingBasePrices: VariantPriceEntity[] = [];

    for (const inventoryRecord of product.inventoryRecords.getItems()) {
      const nextPricing = pricingByInventoryId.get(inventoryRecord.id);
      if (!nextPricing) continue;
      for (const existingPrice of inventoryRecord.prices.getItems()) {
        if (!existingPrice.marketCode && !existingPrice.activeTo) existingPrice.activeTo = new Date();
      }
    }
    await entityManager.flush();

    for (const inventoryRecord of product.inventoryRecords.getItems()) {
      const nextPricing = pricingByInventoryId.get(inventoryRecord.id);
      if (!nextPricing) continue;
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
    return toProductDraftSummary(product, this.storageService);
  }

  async replaceShipping(input: ReplaceProductShippingRepositoryInput): Promise<ProductDraftSummary | null> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);
    const product = await repository.findOne(
      { id: input.productId },
      { populate: [...MikroOrmProductCommandRepository.summaryPopulate] },
    );
    if (!product) return null;

    for (const shippingProfile of product.shippingProfiles.getItems()) {
      for (const destination of shippingProfile.destinations.getItems()) entityManager.remove(destination);
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
      const destinationEntity = entityManager.create(ProductShippingDestinationEntity, {
        shippingProfile,
        countryCode: destination.countryCode,
        deliveryTimeLabel: destination.deliveryTimeLabel,
        service: destination.service,
        chargeType: destination.chargeType,
        rank: destination.rank,
      });
      shippingProfile.destinations.add(destinationEntity);
      entityManager.persist(destinationEntity);
    }

    product.shippingProfiles.add(shippingProfile);
    entityManager.persist(shippingProfile);
    await entityManager.persistAndFlush(product);
    return toProductDraftSummary(product, this.storageService);
  }

  async updateDetails(input: UpdateProductDetailsRepositoryInput): Promise<ProductDraftSummary | null> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);
    const product = await repository.findOne(
      { id: input.productId },
      { populate: [...MikroOrmProductCommandRepository.summaryPopulate] },
    );
    if (!product) return null;
    product.title = input.title;
    product.slug = input.slug;
    product.description = input.description;
    product.whoMade = input.whoMade;
    product.isDigital = input.isDigital;
    product.nonTaxable = input.nonTaxable;
    product.variantGroupName = input.variantGroupName;
    product.variantSubGroupName = input.variantSubGroupName;
    await entityManager.persistAndFlush(product);
    return toProductDraftSummary(product, this.storageService);
  }

  async updateState(productId: string, state: ProductDraftSummary['state']): Promise<ProductDraftSummary | null> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);
    const product = await repository.findOne(
      { id: productId },
      { populate: [...MikroOrmProductCommandRepository.summaryPopulate] },
    );
    if (!product) return null;
    product.state = state;
    await entityManager.persistAndFlush(product);
    return toProductDraftSummary(product, this.storageService);
  }

  async publish(productId: string): Promise<ProductDraftSummary | null> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);
    const product = await repository.findOne(
      { id: productId },
      { populate: [...MikroOrmProductCommandRepository.summaryPopulate] },
    );
    if (!product) return null;
    product.state = ProductState.ACTIVE;
    product.publishedAt = product.publishedAt ?? new Date();
    await entityManager.persistAndFlush(product);
    return toProductDraftSummary(product, this.storageService);
  }

  async createDraft(input: CreateProductDraftRepositoryInput): Promise<ProductDraftSummary> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ProductEntity);
    const product = repository.create({
      shop: entityManager.getReference(ShopEntity, input.shopId),
      category: input.categoryId ? entityManager.getReference(CategoryEntity, input.categoryId) : undefined,
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
      reviewCount: 0,
    });
    await entityManager.persistAndFlush(product);
    return toProductDraftSummary(product, this.storageService);
  }

  private async refreshPublicSortPrices(product: ProductEntity): Promise<void> {
    const primaryInventory = this.getPrimaryInventory(product);
    if (!primaryInventory) {
      product.publicSortPrices = {};
      return;
    }
    const publicSortPrices = await Promise.all(
      MARKETPLACE_MARKETS.filter((market) => market.enabled).map(async (market) => {
        const pricing = await this.resolvedStorefrontPriceService.resolve(primaryInventory, {
          marketCode: market.code,
          currency: market.defaultCurrency,
        });
        return pricing ? [`${market.code}:${market.defaultCurrency}`, pricing.amountMinor] as const : null;
      }),
    );
    product.publicSortPrices = publicSortPrices.reduce<Record<string, number>>((accumulator, entry) => {
      if (!entry) return accumulator;
      const [key, amountMinor] = entry;
      accumulator[key] = amountMinor;
      return accumulator;
    }, {});
  }

  private getPrimaryInventory(product: ProductEntity): ProductInventoryEntity | undefined {
    return product.inventoryRecords.getItems().slice().sort((left, right) => {
      if (!left.productVariant && !right.productVariant) return 0;
      if (!left.productVariant) return -1;
      if (!right.productVariant) return 1;
      return left.productVariant.rank - right.productVariant.rank;
    })[0];
  }

}

function buildInventoryKey(productVariantId?: string): string {
  return productVariantId ?? '__no_variant__';
}
