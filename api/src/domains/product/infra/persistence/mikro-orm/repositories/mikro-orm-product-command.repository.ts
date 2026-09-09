import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { MARKETPLACE_MARKETS } from '~/platform/config/marketplace.config';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { ProductCommandRepository } from '../../../../app/ports/product-command.repository';
import { ProductPricingRepository } from '../../../../app/ports/product-pricing.repository';
import { ResolvedStorefrontPriceService } from '../../../../app/services/resolved-storefront-price.service';
import type {
  CreateProductDraftRepositoryInput,
  ConfigureProductVariantConfigurationRepositoryInput,
  ProductDraftSummary,
  ReplaceProductAttributeValuesRepositoryInput,
  ReplaceProductImagesRepositoryInput,
  ReplaceProductImagesRepositoryResult,
  ReplaceProductShippingRepositoryInput,
  UpdateProductDetailsRepositoryInput,
} from '../../../../app/product.types';
import { ProductImageVariantStatus } from '../../../../domain/enums/product-image-variant-status.enum';
import { ProductState } from '../../../../domain/enums/product-state.enum';
import { ProductVariantLifecycleState } from '../../../../domain/enums/product-variant-lifecycle-state.enum';
import { CategoryAttributeOptionEntity } from '~/domains/category/infra/persistence/entities/category-attribute-option.entity';
import { CategoryAttributeEntity } from '~/domains/category/infra/persistence/entities/category-attribute.entity';
import { CategoryEntity } from '~/domains/category/infra/persistence/entities/category.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { ProductAttributeValueEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-attribute-value.entity';
import { ProductImageEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-image.entity';
import { ProductInventoryEntity, ProductInventoryLifecycleState } from '~/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { ProductOptionEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-option.entity';
import { ProductOptionValueEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-option-value.entity';
import { ProductVariantOptionValueEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-variant-option-value.entity';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ProductShippingDestinationEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-shipping-destination.entity';
import { ProductShippingProfileEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-shipping-profile.entity';
import { ProductVariantEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-variant.entity';
import { VARIANT_PRICE_TYPES, VariantPriceEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/variant-price.entity';
import { OutboxEventEntity, OutboxEventStatus } from '~/domains/order/infra/persistence/entities/outbox-event.entity';
import { getInventoryPricingSnapshot } from '../reads/variant-price-read';
import { toProductDraftSummary } from '../../../projection/product-draft-summary.projector';
import {
  InvalidProductVariantConfigurationError,
  ProductConfigurationConflictError,
} from '../../../../app/errors/product-app.error';
import type { ProductSkuConflictDetail } from '../../../../app/errors/product-app.error';

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
    'options',
    'options.values',
    'inventoryRecords',
    'variants.selections',
    'variants.inventoryRecords',
    'variants.inventoryRecords.prices',
    'variants.selections.productOption',
    'variants.selections.productOptionValue',
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

    product.productVersion += 1;

    await entityManager.persist(product).flush();
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

    product.productVersion += 1;

    await entityManager.persist(product).flush();
    await entityManager.populate(product, ['attributeValues', 'attributeValues.categoryAttribute', 'attributeValues.selectedOption']);
    return toProductDraftSummary(product, this.storageService);
  }

  async configureVariantConfiguration(
    input: ConfigureProductVariantConfigurationRepositoryInput,
  ): Promise<ProductDraftSummary | null> {
    return this.entityManager.fork().transactional(async (entityManager) => {
      const product = await entityManager.getRepository(ProductEntity).findOne(
        { id: input.productId, shop: input.shopId },
        { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
      );

      if (!product || product.productVersion !== input.expectedProductVersion) return null;

      await entityManager.find(ProductInventoryEntity, { product: product.id }, {
        lockMode: LockMode.PESSIMISTIC_WRITE,
        orderBy: { id: 'asc' },
        refresh: true,
      });
      await entityManager.populate(product, [...MikroOrmProductCommandRepository.summaryPopulate], { refresh: true });
      const currentProduct = toProductDraftSummary(product, this.storageService);

      const now = new Date();
      const targetOptionIds = new Set(input.options.map((option) => option.id).filter((id): id is string => Boolean(id)));
      const targetValueIds = new Set(input.options.flatMap((option) => option.values.map((value) => value.id)).filter((id): id is string => Boolean(id)));

      for (const requestedVariant of input.variants) {
        const selectedOptionIdentities = requestedVariant.selections.map((selection) => selection.optionId ?? selection.optionRef);
        if (new Set(selectedOptionIdentities).size !== selectedOptionIdentities.length) {
          throw new InvalidProductVariantConfigurationError('Each option must be selected exactly once');
        }
      }
      if (input.removedVariantIds.length > 0) {
        const reservedRemovedInventory = await entityManager.findOne(ProductInventoryEntity, {
          productVariant: { id: { $in: input.removedVariantIds } },
          reservedQuantity: { $gt: 0 },
        }, { refresh: true });
        if (reservedRemovedInventory) {
          throw new ProductConfigurationConflictError('ProductReservationConflict', [reservedRemovedInventory.id], currentProduct);
        }
      }
      const targetVariantIds = new Set(input.variants.map((variant) => variant.id).filter((id): id is string => Boolean(id)));
      const removedVariantIdSet = new Set(input.removedVariantIds);

      const computedRemovals = product.variants.getItems().filter((variant) =>
        variant.lifecycleState !== ProductVariantLifecycleState.REMOVED && !targetVariantIds.has(variant.id));

      if (removedVariantIdSet.size !== input.removedVariantIds.length
        || computedRemovals.length !== removedVariantIdSet.size
        || computedRemovals.some((variant) => !removedVariantIdSet.has(variant.id))) {
        throw new InvalidProductVariantConfigurationError('removed_variant_ids must exactly acknowledge removed variants');
      }
      if (new Set(input.restoreVariantIds ?? []).size !== (input.restoreVariantIds ?? []).length
        || (input.restoreVariantIds ?? []).some((id) => !targetVariantIds.has(id)
          || !product.variants.getItems().some((variant) => variant.id === id && variant.lifecycleState === ProductVariantLifecycleState.REMOVED))) {
        throw new InvalidProductVariantConfigurationError('restore_variant_ids must identify removed variants in the target configuration');
      }

      for (const option of product.options.getItems()) {
        if (!targetOptionIds.has(option.id)) {
          option.removedAt = option.removedAt ?? now;
        }
      }

      for (const value of product.options.getItems().flatMap((option) => option.values.getItems())) {
        if (!targetValueIds.has(value.id)) {
          value.removedAt = value.removedAt ?? now;
        }
      }

      // Release partial unique keys before inserting replacements; the outer
      // transaction still rolls these retirements back if later validation fails.
      await entityManager.flush();

      const optionByIdentity = new Map<string, ProductOptionEntity>();
      const valueByIdentity = new Map<string, ProductOptionValueEntity>();

      for (const requestedOption of input.options) {
        let option = requestedOption.id
          ? product.options.getItems().find((candidate) => candidate.id === requestedOption.id)
          : undefined;

        if (requestedOption.id && !option) throw new InvalidProductVariantConfigurationError('Option does not belong to this product');

        if (!option) {
          option = entityManager.create(ProductOptionEntity, {
            product,
            name: requestedOption.name.trim(),
            normalizedName: normalizeProductOptionLabel(requestedOption.name),
            position: requestedOption.position,
          });
          product.options.add(option);
          entityManager.persist(option);
        }

        option.name = requestedOption.name.trim();
        option.normalizedName = normalizeProductOptionLabel(requestedOption.name);
        option.position = requestedOption.position;
        option.removedAt = undefined;
        optionByIdentity.set(requestedOption.id ?? requestedOption.clientRef!, option);

        for (const requestedValue of requestedOption.values) {
          let value = requestedValue.id
            ? option.values.getItems().find((candidate) => candidate.id === requestedValue.id)
            : undefined;
          if (requestedValue.id && !value) throw new InvalidProductVariantConfigurationError('Value does not belong to this option');

          if (!value) {
            value = entityManager.create(ProductOptionValueEntity, {
              productOption: option,
              value: requestedValue.value.trim(),
              normalizedValue: normalizeProductOptionLabel(requestedValue.value),
              position: requestedValue.position,
            });
            option.values.add(value);
            entityManager.persist(value);
          }

          value.value = requestedValue.value.trim();
          value.normalizedValue = normalizeProductOptionLabel(requestedValue.value);
          value.position = requestedValue.position;
          value.removedAt = undefined;
          valueByIdentity.set(requestedValue.id ?? requestedValue.clientRef!, value);
        }
      }


      for (const variant of product.variants.getItems()) {
        if (variant.lifecycleState === ProductVariantLifecycleState.REMOVED) continue;
        if (targetVariantIds.has(variant.id)) continue;
        if (!removedVariantIdSet.has(variant.id)) throw new InvalidProductVariantConfigurationError('Variant removal was not acknowledged');
        if (variant.inventoryRecords.getItems().some((inventory) => inventory.reservedQuantity > 0)) {
          throw new ProductConfigurationConflictError('ProductReservationConflict', variant.inventoryRecords.getItems().filter((inventory) => inventory.reservedQuantity > 0).map((inventory) => inventory.id), currentProduct);
        }
        variant.lifecycleState = ProductVariantLifecycleState.REMOVED;
        variant.removedAt = variant.removedAt ?? now;
        for (const inventory of variant.inventoryRecords.getItems()) {
          inventory.lifecycleState = ProductInventoryLifecycleState.REMOVED;
          inventory.removedAt = inventory.removedAt ?? now;
        }
      }

      const skuConflicts = await this.getConflictingConfigurationSkus(entityManager, input, product);
      if (skuConflicts.length > 0) {
        throw new ProductConfigurationConflictError('ProductSkuConflict', skuConflicts.map(conflict => conflict.inventoryId).filter((id): id is string => Boolean(id)), currentProduct, skuConflicts);
      }

      for (const [requestedVariantIndex, requestedVariant] of input.variants.entries()) {
        let variant = requestedVariant.id
          ? product.variants.getItems().find((candidate) => candidate.id === requestedVariant.id)
          : undefined;
        if (requestedVariant.id && !variant) throw new InvalidProductVariantConfigurationError('Variant does not belong to this product');
        if (
          variant?.lifecycleState === ProductVariantLifecycleState.REMOVED
          && !(input.restoreVariantIds ?? []).includes(variant.id)
        ) {
          throw new InvalidProductVariantConfigurationError('Removed variants require explicit restoration');
        }

        const selectedValues = requestedVariant.selections.map((selection) => {
          const option = optionByIdentity.get(selection.optionId ?? selection.optionRef!);
          const value = valueByIdentity.get(selection.valueId ?? selection.valueRef!);
          if (!option || !value || value.productOption.id !== option.id) return null;
          return { option, value };
        });
        if (selectedValues.some((selection) => !selection)) throw new InvalidProductVariantConfigurationError('Selection does not belong to the target option');

        const typedSelections = selectedValues as Array<{ option: ProductOptionEntity; value: ProductOptionValueEntity }>;
        if (new Set(typedSelections.map((selection) => selection.option.id)).size !== typedSelections.length) {
          throw new InvalidProductVariantConfigurationError('Each option must be selected exactly once');
        }
        const combinationKey = buildProductOptionCombinationKey(typedSelections.map((selection) => selection.value.id));
        if (variant && product.publishedAt && variant.combinationKey !== combinationKey) {
          throw new InvalidProductVariantConfigurationError('Published variant selections are immutable; create a replacement variant');
        }

        if (!variant) {
          variant = entityManager.create(ProductVariantEntity, {
            product,
            rank: nextConfigurationRank(product),
            lifecycleState: requestedVariant.lifecycleState,
            combinationKey,
          });
          product.variants.add(variant);
          entityManager.persist(variant);
        }

        variant.rank = requestedVariantIndex + 1;
        variant.lifecycleState = requestedVariant.lifecycleState;
        variant.removedAt = undefined;
        variant.combinationKey = combinationKey;

        for (const existingSelection of variant.selections.getItems()) {
          entityManager.remove(existingSelection);
        }
        variant.selections.removeAll();
        for (const selection of typedSelections) {
          const selectionEntity = entityManager.create(ProductVariantOptionValueEntity, {
            product,
            productVariant: variant,
            productOption: selection.option,
            productOptionValue: selection.value,
          });
          variant.selections.add(selectionEntity);
          entityManager.persist(selectionEntity);
        }

        let inventory = variant.inventoryRecords.getItems()[0];
        if (!inventory) {
          if (!requestedVariant.inventory || requestedVariant.inventory.onHandQuantity === undefined) throw new InvalidProductVariantConfigurationError('New variants require reviewed inventory');

          inventory = entityManager.create(ProductInventoryEntity, {
            shop: entityManager.getReference(ShopEntity, input.shopId),
            product,
            productVariant: variant,
            sku: requestedVariant.inventory.sku ?? undefined,
            stock: requestedVariant.inventory.onHandQuantity,
            onHandQuantity: requestedVariant.inventory.onHandQuantity,
            reservedQuantity: 0,
            onHandVersion: 1,
            lifecycleState: requestedVariant.lifecycleState === ProductVariantLifecycleState.INACTIVE
              ? ProductInventoryLifecycleState.INACTIVE
              : ProductInventoryLifecycleState.ACTIVE,
          });
          product.inventoryRecords.add(inventory);
          variant.inventoryRecords.add(inventory);
          entityManager.persist(inventory);
          await entityManager.flush();

          await this.persistInventoryMovement(entityManager, {
            inventoryId: inventory.id,
            movementKind: 'seller_count',
            quantityDelta: requestedVariant.inventory.onHandQuantity,
            onHandBefore: 0,
            onHandAfter: requestedVariant.inventory.onHandQuantity,
            reservedBefore: 0,
            reservedAfter: 0,
            cause: 'product_variant_configuration',
            actorType: input.actorId ? 'user' : undefined,
            actorId: input.actorId,
            commandId: input.commandId,
          });
        }
        else {
          inventory.lifecycleState = requestedVariant.lifecycleState === ProductVariantLifecycleState.INACTIVE
            ? ProductInventoryLifecycleState.INACTIVE
            : ProductInventoryLifecycleState.ACTIVE;
          inventory.removedAt = undefined;

          if (requestedVariant.inventory) {
            if (
              requestedVariant.inventory.onHandQuantity !== undefined
              && requestedVariant.inventory.expectedOnHandVersion !== inventory.onHandVersion
            ) {
              throw new ProductConfigurationConflictError('ProductOnHandVersionConflict', [inventory.id], currentProduct);
            }
            if (requestedVariant.inventory.sku !== undefined) inventory.sku = requestedVariant.inventory.sku ?? undefined;
            if (requestedVariant.inventory.onHandQuantity !== undefined) {
              const onHandBefore = inventory.onHandQuantity;
              const reservedBefore = inventory.reservedQuantity;
              inventory.applyOnHandCount({
                onHandQuantity: requestedVariant.inventory.onHandQuantity,
                expectedOnHandVersion: requestedVariant.inventory.expectedOnHandVersion!,
              });
              await this.persistInventoryMovement(entityManager, {
                inventoryId: inventory.id,
                movementKind: 'seller_count',
                quantityDelta: inventory.onHandQuantity - onHandBefore,
                onHandBefore,
                onHandAfter: inventory.onHandQuantity,
                reservedBefore,
                reservedAfter: inventory.reservedQuantity,
                cause: 'product_variant_configuration',
                actorType: input.actorId ? 'user' : undefined,
                actorId: input.actorId,
                commandId: input.commandId,
              });
            }
          }
        }

        if (requestedVariant.inventory?.amountMinor !== undefined && requestedVariant.inventory.currency) {
          const currentPrice = getInventoryPricingSnapshot(inventory);
          if (
            !currentPrice
            || currentPrice.amountMinor !== requestedVariant.inventory.amountMinor
            || currentPrice.currency !== requestedVariant.inventory.currency
          ) {
            const activeBasePrices = inventory.prices.getItems().filter((existingPrice) => !existingPrice.marketCode && !existingPrice.activeTo);
            for (const existingPrice of activeBasePrices) existingPrice.activeTo = now;
            if (activeBasePrices.length > 0) await entityManager.flush();

            const priceEntity = entityManager.create(VariantPriceEntity, {
              productInventory: inventory,
              priceType: VARIANT_PRICE_TYPES.BASE,
              activeFrom: now,
              amountMinor: requestedVariant.inventory.amountMinor,
              currency: requestedVariant.inventory.currency,
            });
            inventory.prices.add(priceEntity);
            entityManager.persist(priceEntity);
          }
        }
      }

      product.productVersion += 1;
      await this.refreshPublicSortPrices(product);
      this.persistLifecycleOutboxEvent(entityManager, product, 'product.variant_configuration_changed', {
        commandId: input.commandId,
        actorId: input.actorId,
        removedVariantIds: input.removedVariantIds,
        restoreVariantIds: input.restoreVariantIds ?? [],
      });

      await entityManager.persist(product).flush();
      return toProductDraftSummary(product, this.storageService);
    });
  }


  async replacePricing(input: {
    productId: string;
    pricing: Array<{
      inventoryId: string; amountMinor: number; currency: string
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
        currency: nextPricing.currency,
      });
      inventoryRecord.prices.add(canonicalBasePrice);
      pendingBasePrices.push(canonicalBasePrice);
    }

    product.productVersion += 1;

    entityManager.persist(pendingBasePrices);
    await this.refreshPublicSortPrices(product);
    await entityManager.persist(product).flush();
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
    product.productVersion += 1;
    product.shippingProfiles.add(shippingProfile);
    entityManager.persist(shippingProfile);
    await entityManager.persist(product).flush();
    return toProductDraftSummary(product, this.storageService);
  }

  async updateDetails(input: UpdateProductDetailsRepositoryInput): Promise<ProductDraftSummary | null> {
    return this.entityManager.fork().transactional(async (entityManager) => {
      const repository = entityManager.getRepository(ProductEntity);

      const product = await repository.findOne(
        { id: input.productId, productVersion: input.expectedProductVersion },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );

      if (!product) return null;
      await entityManager.populate(product, [...MikroOrmProductCommandRepository.summaryPopulate], { refresh: true });
      product.title = input.title;
      product.slug = input.slug;
      product.description = input.description;
      product.whoMade = input.whoMade;
      product.isDigital = input.isDigital;
      product.nonTaxable = input.nonTaxable;
      product.tags = input.tags;

      if (input.categoryId !== product.category?.id) {
        for (const attributeValue of product.attributeValues.getItems()) entityManager.remove(attributeValue);
        product.attributeValues.removeAll();
      }
      product.productVersion += 1;
      product.category = input.categoryId
        ? entityManager.getReference(CategoryEntity, input.categoryId)
        : undefined;
      await entityManager.persist(product).flush();
      return toProductDraftSummary(product, this.storageService);
    });
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
    product.removedAt = state === ProductState.REMOVED
      ? (product.removedAt ?? new Date())
      : product.removedAt;
    product.productVersion += 1;

    if (state === ProductState.REMOVED) {
      for (const variant of product.variants.getItems()) {
        variant.lifecycleState = ProductVariantLifecycleState.REMOVED;
        variant.removedAt = variant.removedAt ?? product.removedAt;
      }
      for (const inventory of product.inventoryRecords.getItems()) {
        inventory.lifecycleState = ProductInventoryLifecycleState.REMOVED;
        inventory.removedAt = inventory.removedAt ?? product.removedAt;
      }
    }

    this.persistLifecycleOutboxEvent(entityManager, product, `product.${state}`, {
      state,
    });
    await entityManager.persist(product).flush();
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
    product.productVersion += 1;
    this.persistLifecycleOutboxEvent(entityManager, product, 'product.published', {
      state: product.state,
    });
    await entityManager.persist(product).flush();
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
      tags: input.tags ?? [],
      publicSortPrices: {},
      views: 0,
      ratingAverage: 0,
      reviewCount: 0,
      productVersion: 1,
    });
    const defaultVariant = this.getOrCreateDefaultVariant(entityManager, product);
    const inventoryEntity = entityManager.create(ProductInventoryEntity, {
      shop: entityManager.getReference(ShopEntity, input.shopId),
      product,
      productVariant: defaultVariant,
      stock: 0,
      onHandQuantity: 0,
      reservedQuantity: 0,
      onHandVersion: 1,
      lifecycleState: ProductInventoryLifecycleState.ACTIVE,
    });
    product.inventoryRecords.add(inventoryEntity);
    entityManager.persist(inventoryEntity);
    await entityManager.persist(product).flush();
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

  private async getConflictingConfigurationSkus(
    entityManager: EntityManager,
    input: ConfigureProductVariantConfigurationRepositoryInput,
    product: ProductEntity,
  ): Promise<ProductSkuConflictDetail[]> {
    type RequestedSkuRow = ProductSkuConflictDetail & { skuKey: string };
    const requestedSkuRows = input.variants.flatMap<RequestedSkuRow>((variant) => {
      const sku = variant.inventory?.sku?.trim();
      if (!sku) return [];
      return [{
        sku,
        skuKey: sku.toLocaleLowerCase(),
        variantId: variant.id,
        clientRef: variant.clientRef,
        inventoryId: product.inventoryRecords.getItems().find(inventory => inventory.productVariant?.id === variant.id)?.id,
      }];
    });

    const skuKeys = [...new Set(requestedSkuRows.map(row => row.skuKey))];
    if (skuKeys.length === 0) return [];

    const duplicateSkuKeys = requestedSkuRows.reduce<Map<string, number>>((counts, row) => {
      counts.set(row.skuKey, (counts.get(row.skuKey) ?? 0) + 1);
      return counts;
    }, new Map());

    const duplicateConflicts = requestedSkuRows
      .filter(row => (duplicateSkuKeys.get(row.skuKey) ?? 0) > 1)
      .map(({ skuKey: _skuKey, ...row }) => row);

    const keptInventoryIds = product.inventoryRecords
      .getItems()
      .filter((inventory) => input.variants.some((variant) => variant.id === inventory.productVariant?.id))
      .map((inventory) => inventory.id);

    const placeholders = skuKeys.map(() => '?').join(', ');
    const excludedInventoryPlaceholders = keptInventoryIds.map(() => '?').join(', ');

    const exclusionSql = keptInventoryIds.length > 0
      ? `and not (id = any(array[${excludedInventoryPlaceholders}]::uuid[]))`
      : '';
    const rows = await entityManager.execute<{
      id: string;
      product_variant_id?: string;
      sku: string;
    }[]>(
      `
        select id, product_variant_id, sku
        from product_inventory
        where shop_id = ?::uuid
          and sku is not null
          and lower(sku) = any(array[${placeholders}]::text[])
          and lifecycle_state <> ?
          ${exclusionSql}
      `,
      [
        input.shopId,
        ...skuKeys,
        ProductInventoryLifecycleState.REMOVED,
        ...keptInventoryIds,
      ],
    );

    const persistedSkuKeys = new Set((Array.isArray(rows) ? rows : []).map(row => row.sku.trim().toLocaleLowerCase()));
    const persistedConflicts = requestedSkuRows
      .filter(row => persistedSkuKeys.has(row.skuKey))
      .map(({ skuKey: _skuKey, ...row }) => row);

    const conflictKeys = new Set<string>();
    return [...duplicateConflicts, ...persistedConflicts].filter((conflict) => {
      const key = `${conflict.inventoryId ?? ''}:${conflict.variantId ?? ''}:${conflict.clientRef ?? ''}:${conflict.sku}`;
      if (conflictKeys.has(key)) return false;
      conflictKeys.add(key);
      return true;
    });
  }

  private persistLifecycleOutboxEvent(
    entityManager: EntityManager,
    product: ProductEntity,
    eventName: string,
    payload: Record<string, unknown>,
  ): void {
    entityManager.persist(entityManager.create(OutboxEventEntity, {
      eventName,
      aggregateType: 'product',
      aggregateId: product.id,
      payload: {
        productId: product.id,
        shopId: product.shop.id,
        productVersion: product.productVersion,
        ...payload,
      },
      status: OutboxEventStatus.PENDING,
      attemptCount: 0,
      availableAt: new Date(),
    }));
  }

  private async persistInventoryMovement(
    entityManager: EntityManager,
    input: {
      inventoryId: string;
      movementKind: string;
      quantityDelta: number;
      onHandBefore: number;
      onHandAfter: number;
      reservedBefore: number;
      reservedAfter: number;
      cause: string;
      actorType?: string;
      actorId?: string;
      commandId?: string;
      note?: string;
    },
  ): Promise<void> {
    await entityManager.execute(
      `
        insert into inventory_movements (
          inventory_id,
          movement_kind,
          quantity_delta,
          on_hand_before,
          on_hand_after,
          reserved_before,
          reserved_after,
          cause,
          actor_type,
          actor_id,
          command_id,
          note
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict (command_id, inventory_id, movement_kind) where command_id is not null do nothing
      `,
      [
        input.inventoryId,
        input.movementKind,
        input.quantityDelta,
        input.onHandBefore,
        input.onHandAfter,
        input.reservedBefore,
        input.reservedAfter,
        input.cause,
        input.actorType,
        input.actorId,
        input.commandId,
        input.note,
      ],
    );
  }

  private getOrCreateDefaultVariant(
    entityManager: EntityManager,
    product: ProductEntity,
  ): ProductVariantEntity {
    const existingDefault = product.variants
      .getItems()
      .find((variant) => variant.combinationKey === '__default__');
    if (existingDefault) return existingDefault;

    const variant = entityManager.create(ProductVariantEntity, {
      product,
      rank: 1,
      lifecycleState: ProductVariantLifecycleState.ACTIVE,
      combinationKey: '__default__',
    });
    product.variants.add(variant);
    entityManager.persist(variant);
    return variant;
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


function normalizeProductOptionLabel(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function buildProductOptionCombinationKey(valueIds: string[]): string {
  return valueIds.slice().sort().join('|') || '__default__';
}

function nextConfigurationRank(product: ProductEntity): number {
  return product.variants.length + 1;
}
