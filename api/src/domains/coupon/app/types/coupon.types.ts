import type { CartSnapshot } from '../../../cart/app/cart.types';
import type {
  PricedCartItem,
  ShippingDiscountProvenance,
  ShopAdjustmentInput,
} from '../../../order/app/order.types';
import type { CheckoutShippingShopQuote } from '../../../shipping/app/shipping.types';
import type { CouponAppliesTo } from '../../domain/enums/coupon-applies-to.enum';
import type { CouponIneligibleReason } from '../../domain/enums/coupon-ineligible-reason.enum';
import type { CouponMinOrderType } from '../../domain/enums/coupon-min-order-type.enum';
import type { CouponType } from '../../domain/enums/coupon-type.enum';
import type { ManualPromoOffer } from './manual-promo-offer.mapper';

export interface ApplyCouponToCartInput {
  userId?: string;
  cart: CartSnapshot;
  shopAdjustments?: ShopAdjustmentInput[];
  validatePromoCodes?: boolean;
  checkoutCurrency: string;
  shippingShops?: CheckoutShippingShopQuote[];
}

export interface ListDiscoverableCouponsInput {
  userId?: string;
  cart: CartSnapshot;
  shopId: string;
  checkoutCurrency: string;
}

export interface AddPromoCouponInput {
  userId?: string;
  cart: CartSnapshot;
  shopId: string;
  code: string;
  retainedPromoCodes: string[];
}

export interface CouponPricedShop {
  shopId: string;
  items: PricedCartItem[];
  subtotal: number;
  totalDiscount: number;
  saleDiscount: number;
  promoOffers: ManualPromoOffer[];
  shippingDiscountMinor: number;
  shippingDiscounts: ShippingDiscountProvenance[];
}

/**
 * The safe, code-only display projection of a Coupon a buyer may discover. It
 * never exposes seller-only bookkeeping (identifiers, use counters, visibility,
 * creation timestamps). `amountOff` and `minOrderValue` are major units
 * resolved into the response `currency` (the buyer's checkout currency), so the
 * UI renders exactly the amounts the redemption path enforces.
 *
 * A discoverable Coupon that the current cart cannot redeem is still returned,
 * flagged through `isEligible`/`ineligibleReason`, instead of being hidden. The
 * listing only omits Coupons that are not discoverable at all (`code_only`,
 * automatic sale) or whose money cannot be expressed in the checkout currency.
 */
export interface DiscoverableCoupon {
  code: string;
  type: CouponType;
  appliesTo: CouponAppliesTo;
  amountOff: number;
  percentOff: number;
  minOrderType: CouponMinOrderType;
  minOrderValue: number;
  minProducts: number;
  endDate: Date;
  currency: string;
  isEligible: boolean;
  /** First failing rule in `CouponIneligibleReason` order, or `null` if eligible. */
  ineligibleReason: CouponIneligibleReason | null;
}

/**
 * A code the apply path accepted, with the type the caller needs to reason
 * about its manual slot (shipping vs discount) without another lookup.
 */
export interface AppliedCoupon {
  code: string;
  type: CouponType;
}

export {
  couponMinOrderTypeToManual,
  couponToManualOffer,
  couponTypeToManualType,
  manualMinOrderTypeToCoupon,
  manualTypeToCouponType,
  promotionBenefitTypeToManualType,
  promotionCodeOfferToManualOffer,
  promotionMinOrderTypeToManual,
  type ManualPromoOffer,
  type ManualPromoOfferSource,
  type ManualPromoOfferType,
} from './manual-promo-offer.mapper';
