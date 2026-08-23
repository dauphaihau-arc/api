import type { ProductShippingCharge } from '../domain/enums/product-shipping-charge.enum';
import type { ProductReviewStatus } from '../domain/enums/product-review-status.enum';
import type { ProductState } from '../domain/enums/product-state.enum';
import type { ProductVariantType } from '../domain/enums/product-variant-type.enum';
import type { ProductWhoMade } from '../domain/enums/product-who-made.enum';
import type { PaginatedResult } from '~/platform/application/pagination';

export interface ProductDraftSummary {
  id: string;
  publicId?: string;
  shopId: string;
  shopPublicId?: string;
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
  variantStatus: string;
  variantError?: string;
  variantsGeneratedAt?: Date;
  variants?: ProductImageVariantSummary[];
}

export interface ProductImageVariantSummary {
  id: string;
  variant: string;
  storageKey: string;
  url?: string;
  width?: number;
  height?: number;
  format?: string;
}

export interface ReviewImageSummary {
  id: string;
  storageKey: string;
  url?: string;
  sizeBytes?: number;
  rank: number;
  variantStatus?: string;
  variantError?: string;
  variantsGeneratedAt?: Date;
  variants?: ProductImageVariantSummary[];
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
  categoryAttributeKey: string;
  categoryAttributeName: string;
  inputType: string;
  selectedOptionId?: string;
  selectedOptionKey?: string;
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
  imageUrl?: string;
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
  amountMinor?: number;
  originalAmountMinor?: number;
  currency?: string;
}

export interface ReplaceProductInventoryRepositoryInput {
  productId: string;
  shopId: string;
  inventory: Array<{
    productVariantId?: string;
    sku?: string;
    stock: number;
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

export interface UpdateProductDetailsRepositoryInput {
  productId: string;
  title: string;
  slug: string;
  description: string;
  whoMade: ProductWhoMade;
  isDigital: boolean;
  nonTaxable: boolean;
  variantGroupName?: string;
  variantSubGroupName?: string;
}

export const SHOP_PRODUCT_LIST_DEFAULT_PAGE = 1;
export const SHOP_PRODUCT_LIST_DEFAULT_LIMIT = 20;
export const SHOP_PRODUCT_LIST_MAX_LIMIT = 50;

export interface ListShopProductsInput {
  shopId: string;
  page: number;
  limit: number;
  state?: ProductState;
  categoryId?: string;
  search?: string;
}

export interface ShopProductListResult extends PaginatedResult<ProductDraftSummary> {
  stateCounts: {
    all: number;
    active: number;
    inactive: number;
    draft: number;
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
    publicId?: string;
    shopName: string;
    slug: string;
  };
  categoryId?: string;
  title: string;
  slug: string;
  image?: {
    storageKey: string;
    url?: string;
    variant?: string;
    variants?: Record<string, {
      storageKey: string;
      url?: string;
    }>;
  };
  variantType?: ProductVariantType;
  pricing?: {
    minAmountMinor?: number;
    maxAmountMinor?: number;
    originalMinAmountMinor?: number;
    originalMaxAmountMinor?: number;
    currency?: string;
  };
  availability: {
    inStock: boolean;
    lowStock: boolean;
    stockTotal: number;
  };
  variantCount: number;
  hasFreeShipping?: boolean;
  createdAt: Date;
}

export interface PublicProductSuggestion {
  id: string;
  title: string;
  slug: string;
  shop: {
    id: string;
    publicId?: string;
    shopName: string;
    slug: string;
  };
}

export interface PublicProductInventorySummary {
  id: string;
  productVariantId?: string;
  optionValue1?: string;
  optionValue2?: string;
  sku?: string;
  stock: number;
  amountMinor?: number;
  originalAmountMinor?: number;
  currency?: string;
}

export interface PublicProductShippingSummary {
  originCountry: string;
  processTimeLabel: string;
  destinations: ProductShippingDestinationSummary[];
}

export interface PublicProductDetail {
  id: string;
  shop: {
    id: string;
    publicId?: string;
    shopName: string;
    slug: string;
  };
  categoryId?: string;
  categoryPath?: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
  title: string;
  slug: string;
  description: string;
  whoMade: ProductWhoMade;
  isDigital: boolean;
  variantType?: ProductVariantType;
  variantGroupName?: string;
  variantSubGroupName?: string;
  stockNoticeThreshold: number;
  reviewSummary: {
    average: number;
    count: number;
  };
  images: ProductImageSummary[];
  variants: ProductVariantSummary[];
  inventory: PublicProductInventorySummary[];
  shipping?: PublicProductShippingSummary;
}

export type PublicProductReviewSortOrder = 'newest' | 'highest_rating' | 'lowest_rating';

export interface PublicProductReviewSummary {
  average: number;
  count: number;
  breakdown: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  filters: {
    hasImages: number;
    hasComment: number;
  };
}

export interface PublicProductReviewItem {
  id: string;
  rating: number;
  title?: string;
  body?: string;
  images: ReviewImageSummary[];
  createdAt: Date;
  updatedAt: Date;
  verifiedPurchase: boolean;
  author: {
    displayName: string;
  };
}

export interface PublicProductReviewGalleryItem {
  id: string;
  storageKey: string;
  url?: string;
  sizeBytes?: number;
  rank: number;
  variantStatus?: string;
  variantError?: string;
  variantsGeneratedAt?: Date;
  variants?: ProductImageVariantSummary[];
  reviewId: string;
  reviewTitle?: string;
  createdAt: Date;
  author: {
    displayName: string;
  };
}

export interface ListPublicProductReviewsInput {
  shopSlug: string;
  productSlug: string;
  page: number;
  limit: number;
  sort: PublicProductReviewSortOrder;
  rating?: 1 | 2 | 3 | 4 | 5;
  hasImages?: boolean;
  hasComment?: boolean;
}

export interface PublicProductReviewListResult extends PaginatedResult<PublicProductReviewItem> {
  summary: PublicProductReviewSummary;
}

export interface ListPublicProductReviewImagesInput {
  shopSlug: string;
  productSlug: string;
  limit: number;
  cursor?: string;
}

export interface PublicProductReviewImageListResult {
  items: PublicProductReviewGalleryItem[];
  meta: {
    nextCursor?: string;
    hasMore: boolean;
  };
}

export interface MyProductReview {
  id: string;
  orderId: string;
  orderItemId: string;
  product: {
    id: string;
    slug: string;
    title: string;
    shopSlug: string;
  };
  rating: number;
  title?: string;
  body?: string;
  images: ReviewImageSummary[];
  status: ProductReviewStatus;
  createdAt: Date;
  updatedAt: Date;
}

export const SHOP_PRODUCT_REVIEW_LIST_DEFAULT_PAGE = 1;
export const SHOP_PRODUCT_REVIEW_LIST_DEFAULT_LIMIT = 20;
export const SHOP_PRODUCT_REVIEW_LIST_MAX_LIMIT = 50;

export type ShopProductReviewSortOrder =
  | 'newest'
  | 'oldest'
  | 'highest_rating'
  | 'lowest_rating';

export interface ShopProductReviewItem {
  id: string;
  orderId: string;
  orderItemId: string;
  rating: number;
  title?: string;
  body?: string;
  status: ProductReviewStatus;
  images: ReviewImageSummary[];
  createdAt: Date;
  updatedAt: Date;
  author: {
    id: string;
    displayName: string;
    email: string;
  };
  product: {
    id: string;
    title: string;
    slug: string;
  };
}

export interface ListShopProductReviewsInput {
  shopId: string;
  page: number;
  limit: number;
  status?: ProductReviewStatus;
  productId?: string;
  sort: ShopProductReviewSortOrder;
}

export interface ShopProductReviewListResult extends PaginatedResult<ShopProductReviewItem> {
  counts: {
    all: number;
    published: number;
    hidden: number;
  };
}

export interface ListPublicProductsInput {
  page: number;
  limit: number;
  categoryIds?: string[];
  search?: string;
  title?: string;
  isDigital?: boolean;
  whoMade?: ProductWhoMade;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  attributeFilters?: Array<{
    attributeId?: string;
    selectedOptionIds?: string[];
    selectedOptionKeys?: string[];
    attributeName: string;
    selectedOptionValues: string[];
  }>;
  order?: PublicProductSortOrder;
}

export type PublicProductListResult = PaginatedResult<PublicProductListItem>;

export interface PublicProductFacetOption {
  optionKey: string;
  value: string;
}

export interface PublicProductFacet {
  facetKey: string;
  attributeName: string;
  options: PublicProductFacetOption[];
}

export interface SuggestPublicProductsInput {
  search: string;
  limit: number;
}

export interface RecommendPublicProductsInput {
  shopSlug: string;
  productSlug: string;
  limit: number;
}

export interface ListPublicProductsByShopSlugInput {
  shopSlug: string;
  limit: number;
  excludeProductSlug?: string;
}

export type PublicProductRecommendationSectionType =
  | 'similar_products'
  | 'from_same_seller'
  | 'customers_also_viewed'
  | 'frequently_bought_together';

export interface PublicProductRecommendationSection {
  type: PublicProductRecommendationSectionType;
  title: string;
  items: PublicProductListItem[];
}
