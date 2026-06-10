import type { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import type {
  PublicProductDetail,
  PublicProductListItem
} from '../app/product.types';
import { ProductImageVariant } from '../domain/enums/product-image-variant.enum';
import type { ProductInventoryEntity } from './persistence/entities/product-inventory.entity';
import type { ProductImageEntity } from './persistence/entities/product-image.entity';
import type { ProductEntity } from './persistence/entities/product.entity';

type PublicPricing = {
  amountMinor?: number;
  originalAmountMinor?: number;
  currency?: string;
};

type StorefrontProjectionDeps = {
  resolvePricing: (inventory: ProductInventoryEntity) => Promise<PublicPricing>;
  storageService: Pick<StorageService, 'getPublicUrl'>;
};

export async function toPublicProductDetail(
  product: ProductEntity,
  deps: StorefrontProjectionDeps
): Promise<PublicProductDetail> {
  const inventory = await Promise.all(
    sortInventoryRecords(product.inventoryRecords.getItems()).map(async (inventoryRecord) => ({
      id: inventoryRecord.id,
      productVariantId: inventoryRecord.productVariant?.id,
      sku: inventoryRecord.sku,
      stock: inventoryRecord.stock,
      ...(await deps.resolvePricing(inventoryRecord)),
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
        url: deps.storageService.getPublicUrl(image.storageKey),
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
            url: deps.storageService.getPublicUrl(variant.storageKey),
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

export async function toPublicProductListItem(
  product: ProductEntity,
  deps: StorefrontProjectionDeps
): Promise<PublicProductListItem> {
  const primaryImage = product.images
    .getItems()
    .slice()
    .sort((left, right) => left.rank - right.rank)[0];
  const primaryInventory = getPrimaryInventory(product);
  const resolvedPricing = primaryInventory
    ? await deps.resolvePricing(primaryInventory)
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
    image: primaryImage ? toPublicListImage(primaryImage) : undefined,
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

export function getPrimaryInventory(
  product: ProductEntity
): ProductInventoryEntity | undefined {
  return sortInventoryRecords(product.inventoryRecords.getItems())[0];
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

function toPublicListImage(primaryImage: ProductImageEntity): PublicProductListItem['image'] {
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
