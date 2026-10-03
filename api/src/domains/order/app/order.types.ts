import type { CartSnapshot } from '../../cart/app/cart.types';
import type { ManualPromoOffer } from '../../coupon/app/types/manual-promo-offer.mapper';
import type { CouponEntity } from '../../coupon/infra/persistence/entities/coupon.entity';
import type { FulfillmentAggregateStatus } from '../../fulfillment/domain/enums/fulfillment-aggregate-status.enum';
import type { FulfillmentProgressSnapshot } from '../../fulfillment/domain/fulfillment-progress';
import type { FulfillmentGroupView } from '../../fulfillment/app/fulfillment.types';
import { CouponAppliesTo } from '../../coupon/domain/enums/coupon-applies-to.enum';
import { CouponMinOrderType } from '../../coupon/domain/enums/coupon-min-order-type.enum';
import { CouponType } from '../../coupon/domain/enums/coupon-type.enum';
import type { CheckoutShippingShopQuote } from '../../shipping/app/shipping.types';

export interface ShippingAddressInput {
  fullName: string;
  address1: string;
  address2?: string;
  city: string;
  country: string;
  state: string;
  zip: string;
  phone: string;
}

export type CheckoutActor =
  | {
    type: 'user';
    userId: string;
    email: string;
  }
  | {
    type: 'guest';
    email: string;
  };

export interface CreatedOrderShopRef {
  id: string;
  orderNumber: string;
  shopId: string;
  shopName: string;
  shopSlug: string;
}

export interface CreateOrderResult {
  orderShops: CreatedOrderShopRef[];
  checkoutSessionUrl?: string;
  checkoutSessionId?: string;
  checkoutPending?: boolean;
}

export interface SelectedOptionSnapshot {
  optionId?: string;
  optionName: string;
  valueId?: string;
  value: string;
}

export interface CheckoutQuoteItemSummary {
  inventoryId: string;
  productId: string;
  shopId: string;
  shopName: string;
  shopSlug: string;
  title: string;
  imageUrl?: string;
  imageReference?: string;
  quantity: number;
  sku?: string;
  sourceCurrency: string;
  unitPriceSourceMinor: number;
  lineTotalSourceMinor: number;
  checkoutCurrency: string;
  unitPriceCheckoutMinor: number;
  lineTotalCheckoutMinor: number;
  unitPriceMinor: number;
  originalAmountMinor?: number;
  lineTotalMinor: number;
  /**
   * The product-discount amount allocated to this line, in minor units of the
   * checkout currency. Across a shop's eligible lines these allocations sum
   * exactly to the shop's merchandise discount.
   */
  promoDiscountMinor: number;
  currency: string;
  sourcePriceId?: string;
  sourceType?: 'market_override' | 'base_native' | 'base_fx';
  marketCode?: string;
  fxRate?: string;
  fxSource?: string;
  fxEffectiveAt?: Date;
  fxSourceTimestamp?: Date;
  selectedOptions?: SelectedOptionSnapshot[];
}

export interface CheckoutQuoteShopSummary {
  shopId: string;
  shopName: string;
  shopSlug: string;
  subtotalMinor: number;
  discountMinor: number;
  saleDiscountMinor: number;
  shippingMinor: number;
  shippingDiscountMinor: number;
  totalMinor: number;
  note?: string;
  promoCodes: string[];
  originCountries: string[];
  /** Immutable per-shop shipping quote: charge, calculation, and estimate. */
  shipping?: CheckoutShippingShopQuote;
  shippingDiscounts: ShippingDiscountProvenance[];
  items: CheckoutQuoteItemSummary[];
}

export interface CheckoutQuoteResult {
  quoteId: string;
  presentmentCurrency?: string;
  checkoutCurrency: string;
  subtotalMinor: number;
  shippingMinor: number;
  discountMinor: number;
  saleDiscountMinor: number;
  totalMinor: number;
  /** UTC instant the accepted delivery estimate is anchored to. */
  shippingAnchorAt?: Date;
  expiresAt: Date;
  shops: CheckoutQuoteShopSummary[];
  items: CheckoutQuoteItemSummary[];
}

export interface OrderListProduct {
  id: string;
  title: string;
  slug: string;
  imageUrl?: string;
  imageReference?: string;
  imageStorageKey?: string;
  quantity: number;
  amountMinor: number;
  originalAmountMinor: number | null;
  currency: string;
  sku?: string;
  selectedOptions?: SelectedOptionSnapshot[];
  productId: string;
  shopSlug: string;
  percentCouponPercent: number | null;
  myReview?: {
    id: string;
    rating: number;
    title?: string;
    body?: string;
    status: 'published' | 'hidden';
    createdAt: Date;
    updatedAt: Date;
    images: Array<{
      id: string;
      storageKey: string;
      url?: string;
      sizeBytes?: number;
      rank: number;
      variantStatus?: string;
      variantError?: string;
      variantsGeneratedAt?: Date;
      variants?: Array<{
        id: string;
        variant: string;
        storageKey: string;
        url?: string;
        width?: number;
        height?: number;
        format?: string;
      }>;
    }>;
  };
}

/**
 * The accepted shipping facts of a confirmed Order: the frozen per-shop
 * Shipping Charge calculation, the matched Shipping Profile/rate identities and
 * versions, the Processing/Delivery ranges, the combined seller estimate, and
 * any shipping waiver. These are purchase-time facts, never recomputed.
 */
export interface OrderShippingQuote {
  shipping: CheckoutShippingShopQuote;
  shippingDiscountMinor: number;
  shippingDiscounts: ShippingDiscountProvenance[];
}

export interface OrderListShop {
  id: string;
  orderNumber: string;
  shopId: string;
  shopName: string;
  shopSlug: string;
  currency: string;
  paymentType: string;
  status: string;
  products: OrderListProduct[];
  promoCodes: string[];
  fulfillment: OrderFulfillmentSummary;
  canceledAt?: Date;
  cancelReason?: string;
  customerSupportNote?: string;
  cancelRequestedAt?: Date;
  refundedAt?: Date;
  paymentDetails?: Record<string, unknown>;
  subtotal: number;
  subtotalMinor?: number;
  totalShippingFee: number;
  shippingMinor?: number;
  totalDiscount: number;
  discountMinor?: number;
  saleDiscountMinor?: number;
  total: number;
  totalMinor?: number;
  shippingQuote?: OrderShippingQuote;
  note?: string;
  createdAt: Date;
}

export interface OrderListResult {
  orderShops: OrderListShop[];
}

export interface MyOrderDetail extends OrderListShop {
  customerEmail: string;
  shippingAddress: OrderShippingAddressSummary;
}

export interface AdminOrderDetail extends MyOrderDetail {
  supportNote?: string;
  refundedAt?: Date;
  paymentDetails?: Record<string, unknown>;
}

export interface AdminOrderSummary {
  id: string;
  orderNumber: string;
  shopId: string;
  shopName: string;
  shopSlug: string;
  customerEmail: string;
  currency: string;
  paymentType: string;
  status: string;
  fulfillmentStatus: string;
  total: number;
  totalMinor?: number;
  supportNote?: string;
  cancelReason?: string;
  refundedAt?: Date;
  createdAt: Date;
}

export interface AdminOrderListResult {
  results: AdminOrderSummary[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

export interface OrderShippingAddressSummary {
  fullName: string;
  address1: string;
  address2?: string;
  city: string;
  country: string;
  state: string;
  zip: string;
  phone?: string;
}

/**
 * Immutable order-level shipping facts retained as legacy evidence. These are
 * read-only history: they never prove which quantities were in a parcel and are
 * not a mutable shipping authority.
 */
export interface LegacyOrderShippingEvidence {
  status: string;
  updatedAt: Date;
  toCountry: string;
  fromCountries: string[];
  estimatedDelivery?: Date;
  trackingNumber?: string;
  carrier?: string;
  note?: string;
  shippedAt?: Date;
  deliveredAt?: Date;
}

export interface OrderFulfillmentSummary {
  status: FulfillmentAggregateStatus;
  requiresReconciliation: boolean;
  progress: FulfillmentProgressSnapshot;
  groups: FulfillmentGroupView[];
  legacyShipping: LegacyOrderShippingEvidence;
}

export interface OrderTimelineEvent {
  id: string;
  type: string;
  occurredAt: Date;
  actorType: string;
  actorId?: string;
  source?: string;
  payload?: Record<string, unknown>;
}

export interface ShopOrderSummary {
  id: string;
  orderNumber: string;
  shopId: string;
  shopName: string;
  shopSlug: string;
  customerEmail: string;
  customerFullName: string;
  currency: string;
  paymentType: string;
  status: string;
  products: OrderListProduct[];
  promoCodes: string[];
  fulfillment: OrderFulfillmentSummary;
  canceledAt?: Date;
  cancelReason?: string;
  customerSupportNote?: string;
  cancelRequestedAt?: Date;
  refundedAt?: Date;
  paymentDetails?: Record<string, unknown>;
  subtotal: number;
  subtotalMinor?: number;
  totalShippingFee: number;
  shippingMinor?: number;
  totalDiscount: number;
  discountMinor?: number;
  saleDiscountMinor?: number;
  total: number;
  totalMinor?: number;
  shippingQuote?: OrderShippingQuote;
  note?: string;
  createdAt: Date;
}

export interface ShopOrderListResult {
  results: ShopOrderSummary[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
  statusCounts: {
    all: number;
    awaiting_payment: number;
    pending: number;
    paid: number;
    refunded: number;
    completed: number;
    canceled: number;
    expired: number;
    archived: number;
  };
}

export type ShopDashboardTimeRange =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_month'
  | 'all_time';

export interface ShopDashboardPeriod {
  range: ShopDashboardTimeRange;
  from: Date;
  to: Date;
}

export interface ShopDashboardSummary {
  revenueMinor: number;
  orderCount: number;
  itemsSold: number;
  averageOrderValueMinor: number;
  currency: string;
}

export interface ShopDashboardRevenuePoint {
  date: string;
  label: string;
  revenueMinor: number;
  orderCount: number;
}

export interface ShopDashboardTopProduct {
  productId: string;
  title: string;
  slug: string;
  imageUrl?: string;
  quantitySold: number;
  orderCount: number;
  revenueMinor: number;
  currency: string;
}

export interface ShopDashboardResult {
  period: ShopDashboardPeriod;
  summary: ShopDashboardSummary;
  revenueSeries: ShopDashboardRevenuePoint[];
  recentOrders: ShopOrderSummary[];
  topSellingProducts: ShopDashboardTopProduct[];
}

export interface ShopOrderDetail extends ShopOrderSummary {
  shippingAddress: OrderShippingAddressSummary;
  timeline: OrderTimelineEvent[];
}

export interface ShopAdjustmentInput {
  shopId: string;
  promoCodes?: string[];
  note?: string;
}

export interface PricedCartItem {
  cartItemId: string;
  inventoryId: string;
  productId: string;
  shopId: string;
  shopName: string;
  shopSlug: string;
  title: string;
  imageUrl?: string;
  imageReference?: string;
  quantity: number;
  sku?: string;
  selectedOptions?: SelectedOptionSnapshot[];
  currency: string;
  sourceCurrency?: string;
  sourceUnitPriceMinor?: number;
  unitPriceMinor?: number;
  originalAmountMinor?: number;
  price: number;
  salePrice?: number;
  baseUnitPrice: number;
  effectiveUnitPrice: number;
  sourcePriceId?: string;
  sourceType?: 'market_override' | 'base_native' | 'base_fx';
  marketCode?: string;
  fxRate?: string;
  fxSource?: string;
  fxEffectiveAt?: Date;
  fxSourceTimestamp?: Date;
  autoSaleCoupon?: CouponEntity;
  /**
   * The accepted product-discount amount allocated to this item, in minor units
   * of the checkout currency. It is set by the coupon/promotion pricing path and
   * never exceeds the item's own line total.
   */
  promoDiscountMinor?: number;
}

export interface ShippingDiscountProvenance {
  couponId: string;
  code: string;
  type: 'free_ship';
  appliesTo: CouponAppliesTo;
  appliesProductIds: string[];
  minOrderType: CouponMinOrderType;
  /** Order-total minimum in major units of `currency` (the checkout currency). */
  minOrderValue: number;
  minProducts: number;
  maxUses: number;
  maxUsesPerUser: number;
  usesCount: number;
  /** Shipping money waived by this coupon; never negative, never merchandise. */
  waivedMinor: number;
  currency: string;
}

export interface PricedShopCart {
  shopId: string;
  shopName: string;
  items: PricedCartItem[];
  subtotal: number;
  totalDiscount: number;
  saleDiscount: number;
  totalShippingFee: number;
  total: number;
  note?: string;
  promoOffers: ManualPromoOffer[];
  originCountries: string[];
  /** Per-shop shipping quote: charge, base-unit calculation, and estimate. */
  shipping?: CheckoutShippingShopQuote;
  shippingDiscountMinor?: number;
  shippingDiscounts?: ShippingDiscountProvenance[];
}

export interface PricedCartSummary {
  cart: CartSnapshot;
  shops: PricedShopCart[];
  currency: string;
  subtotalPrice: number;
  totalDiscount: number;
  saleDiscount: number;
  subtotalAfterDiscount: number;
  totalShippingFee: number;
  totalPrice: number;
  totalSelectedQuantity: number;
  totalQuantity: number;
  /** UTC instant the per-shop delivery estimates are anchored to. */
  shippingAnchorAt?: Date;
}

export function isCouponActive(coupon: CouponEntity, now = new Date()): boolean {
  return coupon.isActive && coupon.startDate <= now && coupon.endDate >= now;
}

export function couponAppliesToProduct(
  coupon: CouponEntity,
  productId: string,
): boolean {
  return coupon.appliesTo === CouponAppliesTo.ALL
    || coupon.appliesProductIds.includes(productId);
}

/**
 * A Coupon's monetary fields resolved into the buyer's presentment currency.
 *
 * A Coupon stores `amountOff` and `minOrderValue` in its own canonical
 * `currency` (the owning Shop's currency). Every eligibility check, discount
 * calculation, and display projection compares those amounts against money in
 * the checkout currency, so callers must resolve them through the currency
 * conversion seam first. Percentage and quantity rules are currency-neutral
 * and never use these values.
 */
export interface CouponPresentmentAmounts {
  /** Fixed discount in major units of the presentment currency. */
  amountOff: number;
  /** Order-total minimum in major units of the presentment currency. */
  minOrderValue: number;
}

export function couponMeetsMinimum(
  coupon: CouponEntity,
  amounts: CouponPresentmentAmounts,
  subtotal: number,
  quantity: number,
): boolean {
  if (coupon.minOrderType === CouponMinOrderType.ORDER_TOTAL) {
    return subtotal >= amounts.minOrderValue;
  }

  if (coupon.minOrderType === CouponMinOrderType.NUMBER_OF_PRODUCTS) {
    return quantity >= coupon.minProducts;
  }

  return true;
}

export function computeCouponDiscount(
  coupon: CouponEntity,
  amounts: CouponPresentmentAmounts,
  subtotal: number,
): number {
  if (coupon.type === CouponType.PERCENTAGE) {
    return subtotal * (coupon.percentOff / 100);
  }

  if (coupon.type === CouponType.FIXED_AMOUNT) {
    return amounts.amountOff;
  }

  return 0;
}
