import { ProductImageVariant } from '../../../../domain/enums/product-image-variant.enum';
import type { ProductState } from '../../../../domain/enums/product-state.enum';
import type { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { inferFacetSignalsFromText } from '../../../inferred-facets';

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
  ratingAverage: number;
  reviewCount: number;
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
  options?: Array<{
    id: string;
    name: string;
    position: number;
    values: Array<{
      id: string;
      value: string;
      position: number;
    }>;
  }>;
  variants: Array<{
    id: string;
    selections: Array<{
      optionId: string;
      optionName: string;
      valueId: string;
      value: string;
    }>;
    imageStorageKey?: string;
    rank: number;
  }>;
  variantCount: number;
  inventory: Array<{
    id: string;
    productVariantId: string;
    sku?: string;
    stock: number;
  }>;
  primaryInventory?: {
    id: string;
    productVariantId: string;
    sku?: string;
    stock: number;
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
  search: {
    suggest: string[];
    keywords: string[];
  };
  sort: {
    createdAt: Date;
    inStock: boolean;
    popularityScore: number;
  };
  publishedAt?: Date;
  updatedAt: Date;
  sourceVersion: number;
}

export function toCatalogProductDocument(
  product: ProductEntity,
  getPublicUrl: (storageKey: string) => string | undefined,
): CatalogProductDocument {
  const sortedImages = product.images
    .getItems()
    .slice()
    .sort((left, right) => left.rank - right.rank);
  const sortedVariants = product.variants
    .getItems()
    .filter((variant) => variant.lifecycleState !== 'removed')
    .slice()
    .sort((left, right) => left.rank - right.rank);
  const visibleVariantIds = new Set(sortedVariants.map((variant) => variant.id));
  const sortedInventory = product.inventoryRecords
    .getItems()
    .filter((inventory) =>
      inventory.lifecycleState !== 'removed'
      && (!inventory.productVariant || visibleVariantIds.has(inventory.productVariant.id)))
    .slice()
    .sort((left, right) => {
      if (!left.productVariant && !right.productVariant) return 0;
      if (!left.productVariant) return -1;
      if (!right.productVariant) return 1;
      return left.productVariant.rank - right.productVariant.rank;
    });

  const inventory = sortedInventory.map((row) => {
    return {
      id: row.id,
      productVariantId: row.productVariant?.id,
      sku: row.sku,
      stock: row.stock,
    };
  });
  const options = (product.options?.getItems() ?? [])
    .filter((option) => !option.removedAt)
    .slice()
    .sort((left, right) => left.position - right.position)
    .map((option) => ({
      id: option.id,
      name: option.name,
      position: option.position,
      values: option.values
        .getItems()
        .filter((value) => !value.removedAt)
        .slice()
        .sort((left, right) => left.position - right.position)
        .map((value) => ({
          id: value.id,
          value: value.value,
          position: value.position,
        })),
    }));


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
        ]),
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
    ratingAverage: product.ratingAverage,
    reviewCount: product.reviewCount,
    images: imageDocuments,
    primaryImage: primaryImageDocument,
    options,
    variants: sortedVariants.map((variant) => ({
      id: variant.id,
      selections: variant.selections.getItems().map((selection) => ({
        optionId: selection.productOption.id,
        optionName: selection.productOption.name,
        valueId: selection.productOptionValue.id,
        value: selection.productOptionValue.value,
      })),
      imageStorageKey: variant.imageStorageKey,
      rank: variant.rank,
    })),
    variantCount: sortedVariants.length,
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
    attributes: product.attributeValues
      .getItems()
      .slice()
      .sort(
        (left, right) => left.categoryAttribute.rank - right.categoryAttribute.rank,
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
    search: {
      suggest: uniqueStrings([
        product.title,
        ...sortedVariants.map((variant) => variant.selections.getItems().map((selection) => selection.productOptionValue.value).join(' / ')),
      ].map(normalizeSearchText).filter(Boolean)),
      keywords: uniqueStrings([
        product.title,
        product.shop.shopName,
        product.slug.replaceAll('-', ' '),
        ...sortedVariants.flatMap((variant) => variant.selections.getItems().flatMap((selection) => [
          selection.productOption.name,
          selection.productOptionValue.value,
        ])),
      ].map((value) => normalizeSearchText(value)).filter(Boolean)),
    },
    sort: {
      createdAt: product.createdAt,
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

function toFacetKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
