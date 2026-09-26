import type { ShippingDestinationScope } from '~/domains/shipping/domain/enums/shipping-destination-scope.enum';
import type { ShippingProfileStatus } from '~/domains/shipping/domain/enums/shipping-profile-status.enum';
import type { ShippingProfileReadinessIssue } from '~/domains/shipping/domain/shipping-profile-readiness';
import type { ProductReviewStatus } from '../domain/enums/product-review-status.enum';
import type { ProductState } from '../domain/enums/product-state.enum';
import type { ProductVariantLifecycleState } from '../domain/enums/product-variant-lifecycle-state.enum';
import type { ProductWhoMade } from '../domain/enums/product-who-made.enum';
import type { PaginatedResult } from '~/platform/application/pagination';

export interface ProductDraftSummary {
  id: string;
  publicId?: string;
  shopId: string;
  shopPublicId?: string;
  categoryId?: string;
  categoryName?: string;
  title: string;
  slug: string;
  description: string;
  state: ProductState;
  productVersion?: number;
  publishedAt?: Date;
  removedAt?: Date;
  whoMade: ProductWhoMade;
  isDigital: boolean;
  nonTaxable: boolean;
  tags?: string[];
  images: ProductImageSummary[];
  attributes: ProductAttributeValueSummary[];
  variants: ProductVariantSummary[];
  inventory: ProductInventorySummary[];
  options?: ProductOptionSummary[];
  shipping?: ProductShippingSummary;
}

export interface ProductMutationTarget {
  id: string;
  shopId: string;
  productVersion?: number;
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
  tags?: string[];
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

export interface ProductOptionValueSummary {
  id: string;
  value: string;
  position: number;
}

export interface ProductOptionSummary {
  id: string;
  name: string;
  position: number;
  values: ProductOptionValueSummary[];
}

export interface ProductVariantSummary {
  id: string;
  imageStorageKey?: string;
  imageUrl?: string;
  rank: number;
  lifecycleState?: ProductVariantLifecycleState;
  selections: ProductVariantSelectionSummary[];
  removedAt?: Date;
}


export interface ProductVariantSelectionSummary {
  optionId: string;
  valueId: string;
}

export interface ConfigureProductVariantConfigurationRepositoryInput {
  productId: string;
  shopId: string;
  expectedProductVersion: number;
  commandId?: string;
  actorId?: string;
  options: Array<{
    id?: string;
    clientRef?: string;
    name: string;
    position: number;
    values: Array<{
      id?: string;
      clientRef?: string;
      value: string;
      position: number;
    }>;
  }>;
  variants: Array<{
    id?: string;
    clientRef?: string;
    selections: Array<{
      optionId?: string;
      optionRef?: string;
      valueId?: string;
      valueRef?: string;
    }>;
    lifecycleState: ProductVariantLifecycleState;
    inventory?: {
      sku?: string | null;
      onHandQuantity?: number;
      expectedOnHandVersion?: number;
      amountMinor?: number;
      currency?: string;
    };
  }>;
  removedVariantIds: string[];
  restoreVariantIds?: string[];
}

export interface ProductInventorySummary {
  id: string;
  productVariantId: string;
  sku?: string;
  stock: number;
  onHandQuantity?: number;
  reservedQuantity?: number;
  availableQuantity?: number;
  onHandVersion?: number;
  shortage?: number;
  lifecycleState?: 'active' | 'inactive' | 'removed';
  removedAt?: Date;
  amountMinor?: number;
  originalAmountMinor?: number;
  currency?: string;
}


/**
 * The reusable Shipping Profile a Product is assigned to. Rates live on the
 * profile, so Products never copy shipping configuration.
 */
export interface ProductShippingRateSummary {
  id: string;
  position: number;
  destinationScope: ShippingDestinationScope;
  destinationCountry?: string;
  oneItemFeeMinor: number;
  additionalItemFeeMinor: number;
  /** Elapsed calendar-day transit range after dispatch, when configured. */
  deliveryTimeMinDays?: number;
  deliveryTimeMaxDays?: number;
}

export interface ProductShippingSummary {
  id: string;
  name: string;
  status: ShippingProfileStatus;
  version: number;
  /** Shop currency the minor-unit rate amounts are denominated in. */
  shopCurrency: string;
  shipFromCountry?: string;
  shipFromPostal?: string;
  /** Elapsed calendar-day handling range before dispatch, when configured. */
  processingTimeMinDays?: number;
  processingTimeMaxDays?: number;
  checkoutReady: boolean;
  readinessIssues: ShippingProfileReadinessIssue[];
  rates: ProductShippingRateSummary[];
}

export interface AssignProductShippingProfileRepositoryInput {
  productId: string;
  shippingProfileId?: string;
}

export type AssignProductShippingProfileFailureReason =
  | 'missing'
  | 'archived'
  | 'not_checkout_ready';

/**
 * Assignment takes the same Shipping Profile row lock that profile
 * transitions take, so a concurrent archive or readiness-degrading edit either
 * happens before this call (and is rejected here) or waits until it commits.
 */
export type AssignProductShippingProfileRepositoryResult =
  | { status: 'ok'; product: ProductDraftSummary }
  | { status: 'product_not_found' }
  | {
    status: 'shipping_profile_unavailable';
    reason: AssignProductShippingProfileFailureReason;
  };

/**
 * Publication takes the same Shipping Profile row lock that profile
 * transitions take, so a published Product can never end on a profile that was
 * archived (or stopped pricing checkouts) concurrently.
 */
export type PublishProductRepositoryResult =
  | { status: 'ok'; product: ProductDraftSummary }
  | { status: 'product_not_found' }
  | { status: 'shipping_profile_unavailable' };

export interface UpdateProductDetailsRepositoryInput {
  productId: string;
  expectedProductVersion: number;
  title: string;
  slug: string;
  description: string;
  whoMade: ProductWhoMade;
  isDigital: boolean;
  categoryId?: string;
  nonTaxable: boolean;
  tags: string[];
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
  pricing?: {
    minAmountMinor?: number;
    maxAmountMinor?: number;
    originalMinAmountMinor?: number;
    originalMaxAmountMinor?: number;
    currency?: string;
    autoSale?: {
      couponId: string;
      percentOff: number;
    };
  };
  availability: {
    inStock: boolean;
    lowStock: boolean;
    stockTotal: number;
  };
  variantCount: number;
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
  productVariantId: string;
  sku?: string;
  stock: number;
  onHandQuantity?: number;
  reservedQuantity?: number;
  availableQuantity?: number;
  onHandVersion?: number;
  shortage?: number;
  amountMinor?: number;
  originalAmountMinor?: number;
  currency?: string;
  autoSale?: {
    couponId: string;
    percentOff: number;
  };
}

export interface PublicProductShippingDestinationSummary {
  destinationScope: ShippingDestinationScope;
  destinationCountry?: string;
}

export interface PublicProductShippingSummary {
  destinations: PublicProductShippingDestinationSummary[];
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
  stockNoticeThreshold: number;
  reviewSummary: {
    average: number;
    count: number;
  };
  images: ProductImageSummary[];
  variants: ProductVariantSummary[];
  options?: ProductOptionSummary[];
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
