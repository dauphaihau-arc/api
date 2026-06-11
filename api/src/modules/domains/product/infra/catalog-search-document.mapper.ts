import type { ProductState } from '../domain/enums/product-state.enum';
import type { ProductVariantType } from '../domain/enums/product-variant-type.enum';
import type { ProductEntity } from './persistence/entities/product.entity';
import { getInventoryPricingSnapshot } from './variant-price-read';

export interface CatalogSearchDocument {
  _id: string;
  productId: string;
  shopId: string;
  shopPublicId?: string;
  shopSlug: string;
  shopName: string;
  slug: string;
  title: string;
  description: string;
  state: ProductState;
  categoryId?: string;
  isDigital: boolean;
  whoMade: ProductEntity['whoMade'];
  variantType?: ProductVariantType;
  suggest: string[];
  keywords: string[];
  image?: {
    storageKey: string;
    url?: string;
  };
  price: {
    minAmountMinor?: number;
    maxAmountMinor?: number;
    currency?: string;
  };
  inventory: {
    inStock: boolean;
    totalStock: number;
    amountMinor?: number;
    originalAmountMinor?: number;
    currency?: string;
    sku?: string;
  };
  media: {
    primaryImageUrl?: string;
  };
  ranking: {
    popularityScore: number;
    createdAt: Date;
    publishedAt?: Date;
  };
  flags: {
    hasImages: boolean;
  };
  sourceVersion: number;
  updatedAt: Date;
}

export function toCatalogSearchDocument(
  product: ProductEntity,
  getPublicUrl: (storageKey: string) => string | undefined
): CatalogSearchDocument {
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

  const pricingSnapshots = sortedInventory
    .map((row) => getInventoryPricingSnapshot(row))
    .filter((snapshot): snapshot is NonNullable<typeof snapshot> => snapshot != null);
  const priceValues = pricingSnapshots
    .map((snapshot) => snapshot.amountMinor)
    .filter((value): value is number => value != null);
  const primaryImage = sortedImages[0];
  const totalStock = sortedInventory.reduce((sum, row) => sum + row.stock, 0);

  return {
    _id: product.id,
    productId: product.id,
    shopId: product.shop.id,
    shopPublicId: product.shop.publicId,
    shopSlug: product.shop.slug,
    shopName: product.shop.shopName,
    slug: product.slug,
    title: product.title,
    description: product.description,
    state: product.state,
    categoryId: product.category?.id,
    isDigital: product.isDigital,
    whoMade: product.whoMade,
    variantType: product.variantType,
    suggest: uniqueStrings([
      product.title,
      product.slug.replaceAll('-', ' '),
      ...sortedVariants.map((variant) => variant.name),
    ].map(normalizeSearchText).filter(Boolean)),
    keywords: uniqueStrings([
      product.title,
      product.description,
      product.shop.shopName,
      product.slug.replaceAll('-', ' '),
      ...sortedVariants.flatMap((variant) => [
        variant.name,
        variant.optionValue1,
        variant.optionValue2,
      ]),
    ].map(normalizeSearchText).filter(Boolean)),
    image: primaryImage
      ? {
        storageKey: primaryImage.storageKey,
        url: getPublicUrl(primaryImage.storageKey),
      }
      : undefined,
    price: {
      ...(priceValues.length > 0
        ? { minAmountMinor: Math.min(...priceValues) }
        : {}),
      ...(priceValues.length > 0
        ? { maxAmountMinor: Math.max(...priceValues) }
        : {}),
      currency: pricingSnapshots[0]?.currency,
    },
    inventory: {
      inStock: sortedInventory.some((row) => row.stock > 0),
      totalStock,
      amountMinor: pricingSnapshots[0]?.amountMinor,
      originalAmountMinor: pricingSnapshots[0]?.originalAmountMinor,
      currency: pricingSnapshots[0]?.currency,
      sku: sortedInventory[0]?.sku,
    },
    media: {
      primaryImageUrl: primaryImage
        ? getPublicUrl(primaryImage.storageKey)
        : undefined,
    },
    ranking: {
      popularityScore: product.views,
      createdAt: product.createdAt,
      publishedAt: product.publishedAt,
    },
    flags: {
      hasImages: sortedImages.length > 0,
    },
    sourceVersion: product.updatedAt.getTime(),
    updatedAt: product.updatedAt,
  };
}

function normalizeSearchText(value?: string | null): string {
  return value?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
