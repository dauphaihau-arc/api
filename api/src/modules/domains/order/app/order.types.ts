import type { CartSnapshot } from '../../cart/app/cart.types';
import type { CouponEntity } from '../../coupon/infra/persistence/entities/coupon.entity';
import { CouponAppliesTo } from '../../coupon/domain/enums/coupon-applies-to.enum';
import { CouponMinOrderType } from '../../coupon/domain/enums/coupon-min-order-type.enum';
import { CouponType } from '../../coupon/domain/enums/coupon-type.enum';

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

export interface OrderListProduct {
  id: string;
  title: string;
  slug: string;
  imageUrl?: string;
  quantity: number;
  price: number;
  salePrice: number | null;
  variantName?: string;
  variantGroupName?: string;
  variantSubGroupName?: string;
  productId: string;
  shopSlug: string;
  percentCouponPercent: number | null;
}

export interface OrderListShop {
  id: string;
  shopId: string;
  shopName: string;
  shopSlug: string;
  paymentType: string;
  status: string;
  products: OrderListProduct[];
  promoCodes: string[];
  shippingStatus: string;
  shippingUpdatedAt: Date;
  shippingToCountry: string;
  shippingFromCountries: string[];
  shippingEstimatedDelivery: Date;
  trackingNumber?: string;
  shippingCarrier?: string;
  shipmentNote?: string;
  shippedAt?: Date;
  deliveredAt?: Date;
  canceledAt?: Date;
  cancelReason?: string;
  customerSupportNote?: string;
  cancelRequestedAt?: Date;
  subtotal: number;
  totalShippingFee: number;
  totalDiscount: number;
  total: number;
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
  shopId: string;
  shopName: string;
  shopSlug: string;
  customerEmail: string;
  paymentType: string;
  status: string;
  shippingStatus: string;
  total: number;
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

export interface ShopOrderSummary {
  id: string;
  shopId: string;
  shopName: string;
  shopSlug: string;
  customerEmail: string;
  customerFullName: string;
  paymentType: string;
  status: string;
  products: OrderListProduct[];
  promoCodes: string[];
  shippingStatus: string;
  shippingUpdatedAt: Date;
  shippingToCountry: string;
  shippingFromCountries: string[];
  shippingEstimatedDelivery: Date;
  trackingNumber?: string;
  shippingCarrier?: string;
  shipmentNote?: string;
  shippedAt?: Date;
  deliveredAt?: Date;
  canceledAt?: Date;
  cancelReason?: string;
  subtotal: number;
  totalShippingFee: number;
  totalDiscount: number;
  total: number;
  note?: string;
  createdAt: Date;
}

export interface ShopOrderListResult {
  results: ShopOrderSummary[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

export interface ShopOrderDetail extends ShopOrderSummary {
  shippingAddress: OrderShippingAddressSummary;
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
  quantity: number;
  variantGroupName?: string;
  variantSubGroupName?: string;
  variantName?: string;
  price: number;
  salePrice?: number;
  baseUnitPrice: number;
  effectiveUnitPrice: number;
  autoSaleCoupon?: CouponEntity;
}

export interface PricedShopCart {
  shopId: string;
  shopName: string;
  items: PricedCartItem[];
  subtotal: number;
  totalDiscount: number;
  totalShippingFee: number;
  total: number;
  note?: string;
  promoCoupons: CouponEntity[];
  originCountries: string[];
}

export interface PricedCartSummary {
  cart: CartSnapshot;
  shops: PricedShopCart[];
  subtotalPrice: number;
  totalDiscount: number;
  subtotalAfterDiscount: number;
  totalShippingFee: number;
  totalPrice: number;
  totalSelectedQuantity: number;
  totalQuantity: number;
}

export function isCouponActive(coupon: CouponEntity, now = new Date()): boolean {
  return coupon.isActive && coupon.startDate <= now && coupon.endDate >= now;
}

export function couponAppliesToProduct(
  coupon: CouponEntity,
  productId: string
): boolean {
  return coupon.appliesTo === CouponAppliesTo.ALL
    || coupon.appliesProductIds.includes(productId);
}

export function couponMeetsMinimum(
  coupon: CouponEntity,
  subtotal: number,
  quantity: number
): boolean {
  if (coupon.minOrderType === CouponMinOrderType.ORDER_TOTAL) {
    return subtotal >= coupon.minOrderValue;
  }

  if (coupon.minOrderType === CouponMinOrderType.NUMBER_OF_PRODUCTS) {
    return quantity >= coupon.minProducts;
  }

  return true;
}

export function computeCouponDiscount(
  coupon: CouponEntity,
  subtotal: number
): number {
  if (coupon.type === CouponType.PERCENTAGE) {
    return subtotal * (coupon.percentOff / 100);
  }

  if (coupon.type === CouponType.FIXED_AMOUNT) {
    return coupon.amountOff;
  }

  return 0;
}
