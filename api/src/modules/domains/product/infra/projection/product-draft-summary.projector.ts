import type { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import type { ProductDraftSummary } from '../app/product.types';
import type { ProductInventoryEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import type { ProductEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { getInventoryPricingSnapshot } from './persistence/mikro-orm/reads/variant-price-read';

export function toProductDraftSummary(
  product: ProductEntity,
  storageService: Pick<StorageService, 'getPublicUrl'>
): ProductDraftSummary {
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
        (left, right) => left.categoryAttribute.rank - right.categoryAttribute.rank
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
    inventory: sortInventoryRecords(product.inventoryRecords.getItems()).map((inventoryRecord) => ({
      id: inventoryRecord.id,
      productVariantId: inventoryRecord.productVariant?.id,
      sku: inventoryRecord.sku,
      stock: inventoryRecord.stock,
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
  inventory: ProductInventoryEntity
): { amountMinor?: number; originalAmountMinor?: number; currency?: string } {
  const pricing = getInventoryPricingSnapshot(inventory);

  return {
    amountMinor: pricing?.amountMinor,
    ...(pricing?.originalAmountMinor !== undefined ? { originalAmountMinor: pricing.originalAmountMinor } : {}),
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
