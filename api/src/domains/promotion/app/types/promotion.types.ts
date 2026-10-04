import type { CartSnapshot } from '../../../cart/app/cart.types';
import type {
  PricedCartItem,
  ShippingDiscountProvenance,
  ShopAdjustmentInput,
} from '../../../order/app/order.types';
import type { CheckoutShippingShopQuote } from '../../../shipping/app/shipping.types';
import type { PromotionBenefitType } from '../../domain/enums/promotion-benefit-type.enum';
import type { PromoCodeIneligibleReason } from '../../domain/enums/promo-code-ineligible-reason.enum';
import type { PromotionMinOrderType } from '../../domain/enums/promotion-min-order-type.enum';
import type { PromotionProductScope } from '../../domain/enums/promotion-product-scope.enum';
import type { PromoOffer } from './promo-offer.mapper';

export interface ApplyPromoCodeToCartInput {
  userId?: string;
  cart: CartSnapshot;
  shopAdjustments?: ShopAdjustmentInput[];
  validatePromoCodes?: boolean;
  checkoutCurrency: string;
  shippingShops?: CheckoutShippingShopQuote[];
}

export interface ListDiscoverablePromoCodesInput {
  userId?: string;
  cart: CartSnapshot;
  shopId: string;
  checkoutCurrency: string;
}

export interface AddPromoCodeInput {
  userId?: string;
  cart: CartSnapshot;
  shopId: string;
  code: string;
  retainedPromoCodes: string[];
}

export interface PricedPromoShop {
  shopId: string;
  items: PricedCartItem[];
  subtotal: number;
  totalDiscount: number;
  saleDiscount: number;
  promoOffers: PromoOffer[];
  shippingDiscountMinor: number;
  shippingDiscounts: ShippingDiscountProvenance[];
}

/**
 * The safe, code-only display projection of a Promo Code a buyer may discover.
 * It never exposes seller-only bookkeeping (identifiers, use counters, visibility,
 * creation timestamps). `amountOff` and `minOrderValue` are major units
 * resolved into the response `currency` (the buyer's checkout currency), so the
 * UI renders exactly the amounts the redemption path enforces.
 *
 * A discoverable Promo Code that the current cart cannot redeem is still
 * returned, flagged through `isEligible`/`ineligibleReason`, instead of being
 * hidden. The listing only omits Promo Codes that are not discoverable at all
 * (non-public visibility, a Promotion that has not started, ended, been
 * cancelled, or reached its global redemption limit) and any offer whose money
 * cannot be expressed in the checkout currency.
 */
export interface DiscoverablePromoCode {
  code: string;
  benefitType: PromotionBenefitType;
  productScope: PromotionProductScope;
  amountOff: number;
  percentOff: number;
  minOrderType: PromotionMinOrderType;
  minOrderValue: number;
  minPurchaseQuantity: number;
  endDate: Date;
  currency: string;
  isEligible: boolean;
  /** First failing rule in `PromoCodeIneligibleReason` order, or `null` if eligible. */
  ineligibleReason: PromoCodeIneligibleReason | null;
}

/**
 * A code the apply path accepted, with the benefit type the caller needs to
 * reason about its manual slot (shipping vs discount) without another lookup.
 */
export interface AppliedPromoCode {
  code: string;
  benefitType: PromotionBenefitType;
}

export {
  promotionCodeEntityToPromoOffer,
  promotionCodeOfferToPromoOffer,
  type PromoOffer,
} from './promo-offer.mapper';
