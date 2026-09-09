import type { StorageService } from '~/integrations/storage/app/ports/storage.service';
import type { ProductDraftSummary } from '../../app/product.types';
import type { ProductInventoryEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import type { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { getInventoryPricingSnapshot } from '../persistence/mikro-orm/reads/variant-price-read';

export function toProductDraftSummary(
  product: ProductEntity,
  storageService: Pick<StorageService, 'getPublicUrl'>,
): ProductDraftSummary {
  return {
    id: product.id,
    publicId: product.publicId,
    shopId: product.shop.id,
    shopPublicId: product.shop.publicId,
    categoryId: product.category?.id,
    categoryName: product.category?.name,
    title: product.title,
    slug: product.slug,
    description: product.description,
    state: product.state,
    productVersion: product.productVersion,
    publishedAt: product.publishedAt,
    removedAt: product.removedAt,
    whoMade: product.whoMade,
    isDigital: product.isDigital,
    nonTaxable: product.nonTaxable,
    tags: product.tags ?? [],
    images: product.images
      .getItems()
      .sort((left, right) => left.rank - right.rank)
      .map((image) => ({
        id: image.id,
        storageKey: image.storageKey,
        url: storageService.getPublicUrl(image.storageKey),
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
            url: storageService.getPublicUrl(variant.storageKey),
            width: variant.width,
            height: variant.height,
            format: variant.format,
          })),
      })),
    attributes: product.attributeValues
      .getItems()
      .sort(
        (left, right) => left.categoryAttribute.rank - right.categoryAttribute.rank,
      )
      .map((attributeValue) => ({
        id: attributeValue.id,
        categoryAttributeId: attributeValue.categoryAttribute.id,
        categoryAttributeKey: attributeValue.categoryAttribute.key,
        categoryAttributeName: attributeValue.categoryAttribute.name,
        inputType: attributeValue.categoryAttribute.inputType,
        selectedOptionId: attributeValue.selectedOption?.id,
        selectedOptionKey: attributeValue.selectedOption?.value
          ? toFacetKey(attributeValue.selectedOption.value)
          : undefined,
        selectedOptionValue: attributeValue.selectedOption?.value,
        selectedText: attributeValue.selectedText,
      })),
    options: product.options
      .getItems()
      .filter((option) => !option.removedAt)
      .sort((left, right) => left.position - right.position)
      .map((option) => ({
        id: option.id,
        name: option.name,
        position: option.position,
        values: option.values
          .getItems()
          .filter((value) => !value.removedAt)
          .sort((left, right) => left.position - right.position)
          .map((value) => ({
            id: value.id,
            value: value.value,
            position: value.position,
          })),
      })),
    variants: product.variants
      .getItems()
      .sort((left, right) => left.rank - right.rank)
      .map((variant) => ({
        id: variant.id,
        imageStorageKey: variant.imageStorageKey,
        rank: variant.rank,
        lifecycleState: variant.lifecycleState,
        selections: variant.selections
          .getItems()
          .sort((left, right) => left.productOption.position - right.productOption.position)
          .map((selection) => ({
            optionId: selection.productOption.id,
            valueId: selection.productOptionValue.id,
          })),
        removedAt: variant.removedAt,
      })),
    inventory: sortInventoryRecords(product.inventoryRecords.getItems()).map((inventoryRecord) => ({
      id: inventoryRecord.id,
      productVariantId: inventoryRecord.productVariant.id,
      sku: inventoryRecord.sku,
      stock: inventoryRecord.stock,
      onHandQuantity: inventoryRecord.onHandQuantity,
      reservedQuantity: inventoryRecord.reservedQuantity,
      availableQuantity: inventoryRecord.availableQuantity,
      onHandVersion: inventoryRecord.onHandVersion,
      shortage: inventoryRecord.shortage,
      lifecycleState: inventoryRecord.lifecycleState,
      removedAt: inventoryRecord.removedAt,
      ...getSummaryPricing(inventoryRecord),
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

function sortInventoryRecords(inventoryRecords: ProductInventoryEntity[]): ProductInventoryEntity[] {
  return inventoryRecords.slice().sort((left, right) => {
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
  });
}

function getSummaryPricing(
  inventory: ProductInventoryEntity,
): { amountMinor?: number; currency?: string } {
  const pricing = getInventoryPricingSnapshot(inventory);

  return {
    amountMinor: pricing?.amountMinor,
    currency: pricing?.currency,
  };
}

function toFacetKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
