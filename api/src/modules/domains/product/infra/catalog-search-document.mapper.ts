import type { ProductState } from '../domain/enums/product-state.enum';
import type { ProductVariantType } from '../domain/enums/product-variant-type.enum';
import type { ProductEntity } from './persistence/entities/product.entity';
import { inferFacetSignalsFromText } from './inferred-facets';
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
  attributes: Array<{
    categoryAttributeId: string;
    categoryAttributeKey: string;
    categoryAttributeName: string;
    selectedOptionId?: string;
    selectedOptionKey?: string;
    selectedOptionValue?: string;
    selectedText?: string;
  }>;
  inferredFacets: Array<{
    facetKey: string;
    optionKey: string;
    value: string;
  }>;
  suggest: string[];
  keywords: string[];
  image?: {
    storageKey: string;
    url?: string;
  };
  variantCount: number;
  price: {
    minAmountMinor?: number;
    maxAmountMinor?: number;
    currency?: string;
    originalMinAmountMinor?: number;
    originalMaxAmountMinor?: number;
  };
  inventory: {
    inStock: boolean;
    totalStock: number;
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
  const originalPriceValues = pricingSnapshots
    .map((snapshot) => snapshot.originalAmountMinor)
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
    attributes: product.attributeValues
      .getItems()
      .slice()
      .sort(
        (left, right) => left.categoryAttribute.rank - right.categoryAttribute.rank
      )
      .map((attributeValue) => ({
        categoryAttributeId: attributeValue.categoryAttribute.id,
        categoryAttributeKey: attributeValue.categoryAttribute.key,
        categoryAttributeName: attributeValue.categoryAttribute.name,
        selectedOptionId: attributeValue.selectedOption?.id,
        selectedOptionKey: attributeValue.selectedOption?.value
          ? toFacetKey(attributeValue.selectedOption.value)
          : undefined,
        selectedOptionValue: attributeValue.selectedOption?.value,
        selectedText: attributeValue.selectedText,
      })),
    inferredFacets: inferFacetSignalsFromText({
      title: product.title,
      description: product.description,
    }),
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
    variantCount: sortedVariants.length,
    price: {
      ...(priceValues.length > 0
        ? { minAmountMinor: Math.min(...priceValues) }
        : {}),
      ...(priceValues.length > 0
        ? { maxAmountMinor: Math.max(...priceValues) }
        : {}),
      ...(originalPriceValues.length > 0
        ? { originalMinAmountMinor: Math.min(...originalPriceValues) }
        : {}),
      ...(originalPriceValues.length > 0
        ? { originalMaxAmountMinor: Math.max(...originalPriceValues) }
        : {}),
      currency: pricingSnapshots[0]?.currency,
    },
    inventory: {
      inStock: sortedInventory.some((row) => row.stock > 0),
      totalStock,
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

function toFacetKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
