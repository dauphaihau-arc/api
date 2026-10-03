import { PromotionBenefitType } from '~/domains/promotion/domain/enums/promotion-benefit-type.enum';
import type { PromotionCodeOffer } from '~/domains/promotion/app/ports/promotion-code.reader';
import type { PromotionCodeEntity } from '~/domains/promotion/infra/persistence/entities/promotion-code.entity';
import { PromotionMinOrderType } from '~/domains/promotion/domain/enums/promotion-min-order-type.enum';
import { PromotionProductScope } from '~/domains/promotion/domain/enums/promotion-product-scope.enum';
import { CouponAppliesTo } from '../../domain/enums/coupon-applies-to.enum';
import { CouponMinOrderType } from '../../domain/enums/coupon-min-order-type.enum';
import { CouponType } from '../../domain/enums/coupon-type.enum';
import type { CouponEntity } from '../../infra/persistence/entities/coupon.entity';

export type ManualPromoOfferSource = 'coupon' | 'promotion';

export type ManualPromoOfferType =
  | 'percentage'
  | 'fixed_amount'
  | 'free_shipping';

/**
 * The common offer shape consumed by the one shared eligibility and discount
 * rule. Both legacy Coupons and Promotion-backed Checkout Discounts normalize
 * into this shape so pricing never forks by source.
 */
export interface ManualPromoOffer {
  id: string;
  shopId: string;
  code: string;
  source: ManualPromoOfferSource;
  type: ManualPromoOfferType;
  currency: string;
  percentOff: number;
  amountOff: number;
  scope: 'all' | 'specific';
  productIds: string[];
  startAt: Date;
  endAt: Date;
  isActive: boolean;
  minOrderType: 'none' | 'order_total' | 'purchase_quantity';
  minOrderValue: number;
  minPurchaseQuantity: number;
  maxUses: number | null;
  maxUsesPerUser: number | null;
  usesCount: number;
}

export function couponToManualOffer(coupon: CouponEntity): ManualPromoOffer {
  return {
    id: coupon.id,
    shopId: coupon.shop.id,
    code: coupon.code,
    source: 'coupon',
    type: couponTypeToManualType(coupon.type),
    currency: coupon.currency,
    percentOff: coupon.percentOff,
    amountOff: Number(coupon.amountOff),
    scope: coupon.appliesTo === CouponAppliesTo.ALL ? 'all' : 'specific',
    productIds: [...coupon.appliesProductIds],
    startAt: coupon.startDate,
    endAt: coupon.endDate,
    isActive: coupon.isActive,
    minOrderType: couponMinOrderTypeToManual(coupon.minOrderType),
    minOrderValue: Number(coupon.minOrderValue),
    minPurchaseQuantity: coupon.minProducts,
    maxUses: coupon.maxUses,
    maxUsesPerUser: coupon.maxUsesPerUser,
    usesCount: coupon.usesCount,
  };
}

export function promotionCodeOfferToManualOffer(
  offer: PromotionCodeOffer,
): ManualPromoOffer {
  return {
    id: offer.promotionId,
    shopId: offer.shopId,
    code: offer.code,
    source: 'promotion',
    type: promotionBenefitTypeToManualType(offer.benefitType),
    currency: offer.currency,
    percentOff: offer.percentOff,
    amountOff: offer.amountOff,
    scope: offer.productScope,
    productIds: [...offer.productIds],
    startAt: offer.startAt,
    endAt: offer.endAt,
    isActive: true,
    minOrderType: promotionMinOrderTypeToManual(offer.minOrderType),
    minOrderValue: offer.minOrderValue,
    minPurchaseQuantity: offer.minPurchaseQuantity,
    maxUses: offer.maxRedemptions,
    maxUsesPerUser: offer.maxRedemptionsPerBuyer,
    usesCount: offer.usesCount,
  };
}

export function promotionCodeEntityToManualOffer(
  code: PromotionCodeEntity,
): ManualPromoOffer {
  const promotion = code.promotion;
  const productIds = promotion.productScope === PromotionProductScope.ALL
    ? []
    : promotion.products.getItems().map((product) => product.productId);

  return {
    id: promotion.id,
    shopId: code.shopId,
    code: code.code,
    source: 'promotion',
    type: promotionBenefitTypeToManualType(promotion.benefitType),
    currency: promotion.currency,
    percentOff: promotion.percentOff ?? 0,
    amountOff: promotion.amountOff == null ? 0 : Number(promotion.amountOff),
    scope: promotion.productScope,
    productIds,
    startAt: promotion.startAt,
    endAt: promotion.endAt,
    isActive: true,
    minOrderType: promotionMinOrderTypeToManual(promotion.minOrderType ?? PromotionMinOrderType.NONE),
    minOrderValue: promotion.minOrderValue == null ? 0 : Number(promotion.minOrderValue),
    minPurchaseQuantity: promotion.minPurchaseQuantity ?? 0,
    maxUses: promotion.maxRedemptions ?? null,
    maxUsesPerUser: promotion.maxRedemptionsPerBuyer ?? null,
    usesCount: 0,
  };
}

export function manualTypeToCouponType(type: ManualPromoOfferType): CouponType {
  switch (type) {
    case 'fixed_amount':
      return CouponType.FIXED_AMOUNT;
    case 'free_shipping':
      return CouponType.FREE_SHIP;
    case 'percentage':
    default:
      return CouponType.PERCENTAGE;
  }
}

export function couponTypeToManualType(type: CouponType): ManualPromoOfferType {
  switch (type) {
    case CouponType.FIXED_AMOUNT:
      return 'fixed_amount';
    case CouponType.FREE_SHIP:
      return 'free_shipping';
    case CouponType.PERCENTAGE:
    default:
      return 'percentage';
  }
}

export function promotionBenefitTypeToManualType(
  type: PromotionBenefitType,
): ManualPromoOfferType {
  switch (type) {
    case PromotionBenefitType.FIXED_AMOUNT:
      return 'fixed_amount';
    case PromotionBenefitType.FREE_SHIPPING:
      return 'free_shipping';
    case PromotionBenefitType.PERCENTAGE:
    default:
      return 'percentage';
  }
}

export function couponMinOrderTypeToManual(
  type: CouponMinOrderType,
): ManualPromoOffer['minOrderType'] {
  switch (type) {
    case CouponMinOrderType.ORDER_TOTAL:
      return 'order_total';
    case CouponMinOrderType.NUMBER_OF_PRODUCTS:
      return 'purchase_quantity';
    case CouponMinOrderType.NONE:
    default:
      return 'none';
  }
}

export function promotionMinOrderTypeToManual(
  type: PromotionMinOrderType,
): ManualPromoOffer['minOrderType'] {
  switch (type) {
    case PromotionMinOrderType.ORDER_TOTAL:
      return 'order_total';
    case PromotionMinOrderType.PURCHASE_QUANTITY:
      return 'purchase_quantity';
    case PromotionMinOrderType.NONE:
    default:
      return 'none';
  }
}

export function manualMinOrderTypeToCoupon(
  type: ManualPromoOffer['minOrderType'],
): CouponMinOrderType {
  switch (type) {
    case 'order_total':
      return CouponMinOrderType.ORDER_TOTAL;
    case 'purchase_quantity':
      return CouponMinOrderType.NUMBER_OF_PRODUCTS;
    case 'none':
    default:
      return CouponMinOrderType.NONE;
  }
}
