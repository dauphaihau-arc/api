import { ProductImageVariant } from '../domain/enums/product-image-variant.enum';
import { ProductState } from '../domain/enums/product-state.enum';
import type { ProductEntity } from './persistence/entities/product.entity';
import { getInventoryPricingSnapshot } from './variant-price-read';

export interface CatalogProductDocument {
  _id: string;
  productId: string;
  shopId: string;
  shopPublicId?: string;
  shopSlug: string;
  shopName: string;
  categoryId?: string;
  slug: string;
  title: string;
  titleNormalized: string;
  description: string;
  descriptionNormalized: string;
  state: ProductState;
  isDigital: boolean;
  whoMade: ProductEntity['whoMade'];
  variantType?: ProductEntity['variantType'];
  variantGroupName?: string;
  variantSubGroupName?: string;
  images: Array<{
    id: string;
    storageKey: string;
    url?: string;
    rank: number;
    variantStatus: string;
    variantError?: string;
    variantsGeneratedAt?: Date;
    variants?: Record<string, {
      storageKey: string;
      url?: string;
      width?: number;
      height?: number;
      format?: string;
    }>;
  }>;
  primaryImage?: {
    storageKey: string;
    variant?: string;
    variants?: Record<string, {
      storageKey: string;
    }>;
  };
  variants: Array<{
    id: string;
    name: string;
    optionValue1?: string;
    optionValue2?: string;
    imageStorageKey?: string;
    rank: number;
  }>;
  inventory: Array<{
    id: string;
    productVariantId?: string;
    sku?: string;
    stock: number;
    amountMinor?: number;
    originalAmountMinor?: number;
    currency?: string;
  }>;
  primaryInventory?: {
    id: string;
    productVariantId?: string;
    sku?: string;
    stock: number;
    amountMinor?: number;
    originalAmountMinor?: number;
    currency?: string;
  };
  shipping?: {
    originCountry: string;
    processTimeLabel: string;
    destinations: Array<{
      id: string;
      countryCode: string;
      deliveryTimeLabel: string;
      service: string;
      chargeType: string;
      rank: number;
    }>;
  };
  search: {
    suggest: string[];
    keywords: string[];
  };
  sort: {
    createdAt: Date;
    minPriceAmountMinor?: number;
    maxPriceAmountMinor?: number;
    inStock: boolean;
    popularityScore: number;
  };
  publishedAt?: Date;
  updatedAt: Date;
  sourceVersion: number;
}

export function toCatalogProductDocument(
  product: ProductEntity,
  getPublicUrl: (storageKey: string) => string | undefined
): CatalogProductDocument {
  const sortedImages = product.images
    .getItems()
    .slice()
    .sort((left, right) => left.rank - right.rank);
  const sortedVariants = product.variants
    .getItems()
    .slice()
    .sort((left, right) => left.rank - right.rank);
  const sortedInventory = product.inventoryRecords
    .getItems()
    .slice()
    .sort((left, right) => {
      if (!left.productVariant && !right.productVariant) return 0;
      if (!left.productVariant) return -1;
      if (!right.productVariant) return 1;
      return left.productVariant.rank - right.productVariant.rank;
    });

  const inventory = sortedInventory.map((row) => {
    const pricing = getInventoryPricingSnapshot(row);

    return {
      id: row.id,
      productVariantId: row.productVariant?.id,
      sku: row.sku,
      stock: row.stock,
      ...(pricing?.amountMinor != null ? { amountMinor: pricing.amountMinor } : {}),
      ...(pricing?.originalAmountMinor != null
        ? { originalAmountMinor: pricing.originalAmountMinor }
        : {}),
      ...(pricing?.currency ? { currency: pricing.currency } : {}),
    };
  });

  const imageDocuments = sortedImages.map((image) => ({
    id: image.id,
    storageKey: image.storageKey,
    url: getPublicUrl(image.storageKey),
    rank: image.rank,
    variantStatus: image.variantStatus,
    variantError: image.variantError,
    variantsGeneratedAt: image.variantsGeneratedAt,
    variants: image.variants.length > 0
      ? Object.fromEntries(
        image.variants.getItems().map((variant) => [
          variant.variant,
          {
            storageKey: variant.storageKey,
            url: getPublicUrl(variant.storageKey),
            width: variant.width,
            height: variant.height,
            format: variant.format,
          },
        ])
      )
      : undefined,
  }));

  const primaryImage = sortedImages[0];
  const primaryCardVariant = primaryImage?.variants
    .getItems()
    .find((variant) => variant.variant === ProductImageVariant.CARD_1X1);
  const primaryImageDocument = primaryCardVariant
    ? {
      storageKey: primaryCardVariant.storageKey,
      variant: primaryCardVariant.variant,
      variants: {
        [primaryCardVariant.variant]: {
          storageKey: primaryCardVariant.storageKey,
        },
      },
    }
    : primaryImage
      ? {
        storageKey: primaryImage.storageKey,
        variant: 'original',
      }
      : undefined;

  const priceValues = inventory
    .map((row) => row.amountMinor)
    .filter((value): value is number => value != null);

  return {
    _id: product.id,
    productId: product.id,
    shopId: product.shop.id,
    shopPublicId: product.shop.publicId,
    shopSlug: product.shop.slug,
    shopName: product.shop.shopName,
    categoryId: product.category?.id,
    slug: product.slug,
    title: product.title,
    titleNormalized: normalizeSearchText(product.title),
    description: product.description,
    descriptionNormalized: normalizeSearchText(product.description),
    state: product.state,
    isDigital: product.isDigital,
    whoMade: product.whoMade,
    variantType: product.variantType,
    variantGroupName: product.variantGroupName,
    variantSubGroupName: product.variantSubGroupName,
    images: imageDocuments,
    primaryImage: primaryImageDocument,
    variants: sortedVariants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      optionValue1: variant.optionValue1,
      optionValue2: variant.optionValue2,
      imageStorageKey: variant.imageStorageKey,
      rank: variant.rank,
    })),
    inventory,
    primaryInventory: inventory[0],
    shipping: product.shippingProfiles.length > 0
      ? {
        originCountry: product.shippingProfiles[0].originCountry,
        processTimeLabel: product.shippingProfiles[0].processTimeLabel,
        destinations: product.shippingProfiles[0].destinations
          .getItems()
          .slice()
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
    search: {
      suggest: uniqueStrings([
        product.title,
        ...sortedVariants.map((variant) => variant.name),
      ].map(normalizeSearchText).filter(Boolean)),
      keywords: uniqueStrings([
        product.title,
        product.shop.shopName,
        product.slug.replaceAll('-', ' '),
        ...sortedVariants.flatMap((variant) => [
          variant.optionValue1,
          variant.optionValue2,
        ]),
      ].map((value) => normalizeSearchText(value)).filter(Boolean)),
    },
    sort: {
      createdAt: product.createdAt,
      ...(priceValues.length > 0
        ? { minPriceAmountMinor: Math.min(...priceValues) }
        : {}),
      ...(priceValues.length > 0
        ? { maxPriceAmountMinor: Math.max(...priceValues) }
        : {}),
      inStock: inventory.some((row) => row.stock > 0),
      popularityScore: product.views,
    },
    publishedAt: product.publishedAt,
    updatedAt: product.updatedAt,
    sourceVersion: product.updatedAt.getTime(),
  };
}

function normalizeSearchText(value?: string | null): string {
  return value?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
