import type { ProductShippingCharge } from '../domain/enums/product-shipping-charge.enum';
import type { ProductState } from '../domain/enums/product-state.enum';
import type { ProductVariantType } from '../domain/enums/product-variant-type.enum';
import type { ProductWhoMade } from '../domain/enums/product-who-made.enum';
import type { PaginatedResult } from '~/common/application/pagination';

export interface ProductDraftSummary {
  id: string;
  shopId: string;
  categoryId?: string;
  title: string;
  slug: string;
  description: string;
  state: ProductState;
  whoMade: ProductWhoMade;
  isDigital: boolean;
  nonTaxable: boolean;
  variantType?: ProductVariantType;
  variantGroupName?: string;
  variantSubGroupName?: string;
  images: ProductImageSummary[];
  attributes: ProductAttributeValueSummary[];
  variants: ProductVariantSummary[];
  inventory: ProductInventorySummary[];
  shipping?: ProductShippingProfileSummary;
}

export interface CreateProductDraftRepositoryInput {
  shopId: string;
  categoryId?: string;
  title: string;
  slug: string;
  description: string;
  whoMade: ProductWhoMade;
  isDigital: boolean;
  nonTaxable: boolean;
  variantType?: ProductVariantType;
  variantGroupName?: string;
  variantSubGroupName?: string;
}

export interface ProductImageSummary {
  id: string;
  storageKey: string;
  url?: string;
  rank: number;
}

export interface ReplaceProductImagesRepositoryInput {
  productId: string;
  images: Array<{
    storageKey: string;
    rank: number;
  }>;
}

export interface ReplaceProductImagesRepositoryResult {
  product: ProductDraftSummary;
  removedStorageKeys: string[];
}

export interface ProductAttributeValueSummary {
  id: string;
  categoryAttributeId: string;
  categoryAttributeName: string;
  inputType: string;
  selectedOptionId?: string;
  selectedOptionValue?: string;
  selectedText?: string;
}

export interface ReplaceProductAttributeValuesRepositoryInput {
  productId: string;
  attributes: Array<{
    categoryAttributeId: string;
    selectedOptionId?: string;
    selectedText?: string;
  }>;
}

export interface ProductVariantSummary {
  id: string;
  name: string;
  optionValue1?: string;
  optionValue2?: string;
  imageStorageKey?: string;
  rank: number;
}

export interface ReplaceProductVariantsRepositoryInput {
  productId: string;
  variants: Array<{
    name: string;
    optionValue1?: string;
    optionValue2?: string;
    rank: number;
  }>;
}

export interface ProductInventorySummary {
  id: string;
  productVariantId?: string;
  sku?: string;
  stock: number;
  price: number;
  salePrice?: number;
}

export interface ReplaceProductInventoryRepositoryInput {
  productId: string;
  shopId: string;
  inventory: Array<{
    productVariantId?: string;
    sku?: string;
    stock: number;
    price: number;
    salePrice?: number;
  }>;
}

export interface ProductShippingDestinationSummary {
  id: string;
  countryCode: string;
  deliveryTimeLabel: string;
  service: string;
  chargeType: ProductShippingCharge;
  rank: number;
}

export interface ProductShippingProfileSummary {
  id: string;
  originCountry: string;
  originZip: string;
  processTimeLabel: string;
  destinations: ProductShippingDestinationSummary[];
}

export interface ReplaceProductShippingRepositoryInput {
  productId: string;
  shopId: string;
  shipping: {
    originCountry: string;
    originZip: string;
    processTimeLabel: string;
    destinations: Array<{
      countryCode: string;
      deliveryTimeLabel: string;
      service: string;
      chargeType: ProductShippingCharge;
      rank: number;
    }>;
  };
}

export const PRODUCT_PUBLIC_LIST_DEFAULT_PAGE = 1;
export const PRODUCT_PUBLIC_LIST_DEFAULT_LIMIT = 12;
export const PRODUCT_PUBLIC_LIST_MAX_LIMIT = 50;

export type PublicProductSortOrder = 'newest' | 'price_asc' | 'price_desc';

export interface PublicProductListItem {
  id: string;
  shop: {
    id: string;
    shopName: string;
  };
  categoryId?: string;
  title: string;
  slug: string;
  image?: {
    storageKey: string;
    url?: string;
  };
  variantType?: ProductVariantType;
  inventory?: {
    price: number;
    salePrice?: number;
    stock: number;
    sku?: string;
  };
  createdAt: Date;
}

export interface ListPublicProductsInput {
  page: number;
  limit: number;
  categoryIds?: string[];
  search?: string;
  title?: string;
  isDigital?: boolean;
  whoMade?: ProductWhoMade;
  order?: PublicProductSortOrder;
}

export type PublicProductListResult = PaginatedResult<PublicProductListItem>;
