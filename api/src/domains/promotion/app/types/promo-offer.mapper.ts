import type { PromotionCodeOffer } from '~/domains/promotion/app/ports/promotion-code.reader';
import type { PromotionCodeEntity } from '~/domains/promotion/infra/persistence/entities/promotion-code.entity';
import type { PromotionBenefitType } from '~/domains/promotion/domain/enums/promotion-benefit-type.enum';
import { PromotionMinOrderType } from '~/domains/promotion/domain/enums/promotion-min-order-type.enum';
import { PromotionProductScope } from '~/domains/promotion/domain/enums/promotion-product-scope.enum';

/**
 * The common offer shape consumed by the shared eligibility and discount
 * rule. A Checkout Discount normalizes into this shape so pricing never forks
 * by source.
 */
export interface PromoOffer {
  id: string;
  shopId: string;
  code: string;
  benefitType: PromotionBenefitType;
  currency: string;
  percentOff: number;
  amountOff: number;
  productScope: PromotionProductScope;
  productIds: string[];
  startAt: Date;
  endAt: Date;
  isActive: boolean;
  minOrderType: PromotionMinOrderType;
  minOrderValue: number;
  minPurchaseQuantity: number;
  maxRedemptions: number | null;
  maxRedemptionsPerBuyer: number | null;
  redemptionCount: number;
}

export function promotionCodeOfferToPromoOffer(
  offer: PromotionCodeOffer,
): PromoOffer {
  return {
    id: offer.promotionId,
    shopId: offer.shopId,
    code: offer.code,
    benefitType: offer.benefitType,
    currency: offer.currency,
    percentOff: offer.percentOff,
    amountOff: offer.amountOff,
    productScope: offer.productScope,
    productIds: [...offer.productIds],
    startAt: offer.startAt,
    endAt: offer.endAt,
    isActive: true,
    minOrderType: offer.minOrderType,
    minOrderValue: offer.minOrderValue,
    minPurchaseQuantity: offer.minPurchaseQuantity,
    maxRedemptions: offer.maxRedemptions,
    maxRedemptionsPerBuyer: offer.maxRedemptionsPerBuyer,
    redemptionCount: offer.redemptionCount,
  };
}

export function promotionCodeEntityToPromoOffer(
  code: PromotionCodeEntity,
): PromoOffer {
  const promotion = code.promotion;
  const productIds = promotion.productScope === PromotionProductScope.ALL
    ? []
    : promotion.products.getItems().map((product) => product.productId);

  return {
    id: promotion.id,
    shopId: code.shopId,
    code: code.code,
    benefitType: promotion.benefitType,
    currency: promotion.currency,
    percentOff: promotion.percentOff ?? 0,
    amountOff: promotion.amountOff == null ? 0 : Number(promotion.amountOff),
    productScope: promotion.productScope,
    productIds,
    startAt: promotion.startAt,
    endAt: promotion.endAt,
    isActive: true,
    minOrderType: promotion.minOrderType ?? PromotionMinOrderType.NONE,
    minOrderValue: promotion.minOrderValue == null ? 0 : Number(promotion.minOrderValue),
    minPurchaseQuantity: promotion.minPurchaseQuantity ?? 0,
    maxRedemptions: promotion.maxRedemptions ?? null,
    maxRedemptionsPerBuyer: promotion.maxRedemptionsPerBuyer ?? null,
    redemptionCount: 0,
  };
}
