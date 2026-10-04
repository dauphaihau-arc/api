import type { ShopPromoCodeSummary } from './shop.types';
import { PromotionMinOrderType } from '~/domains/promotion/domain/enums/promotion-min-order-type.enum';
import { resolvePromotionStatus } from '~/domains/promotion/domain/promotion-lifecycle';
import type { PromotionEntity } from '~/domains/promotion/infra/persistence/entities/promotion.entity';

/**
 * The seller-facing view of one Promo Code: its internal name, redemption code,
 * benefit, visibility, Product Scope, schedule and retained lifecycle state.
 */
export function toShopPromoCodeSummary(
  promotion: PromotionEntity,
  code: string,
  productIds: string[],
  now: Date,
  redemptionCount: number,
): ShopPromoCodeSummary {
  return {
    id: promotion.id,
    shopId: promotion.shop.id,
    name: promotion.name,
    code,
    benefitType: promotion.benefitType,
    percentOff: promotion.percentOff ?? 0,
    amountOff: promotion.amountOff == null ? null : Number(promotion.amountOff),
    currency: promotion.currency,
    visibility: promotion.visibility ?? 'code_only',
    productScope: promotion.productScope,
    productIds,
    minOrderType: promotion.minOrderType ?? PromotionMinOrderType.NONE,
    minOrderValue: promotion.minOrderValue == null ? 0 : Number(promotion.minOrderValue),
    minPurchaseQuantity: promotion.minPurchaseQuantity ?? 0,
    maxRedemptions: promotion.maxRedemptions ?? null,
    maxRedemptionsPerBuyer: promotion.maxRedemptionsPerBuyer ?? null,
    redemptionCount,
    exhausted: promotion.maxRedemptions != null && redemptionCount >= promotion.maxRedemptions,
    startAt: promotion.startAt,
    endAt: promotion.endAt,
    timezone: promotion.timezone,
    status: resolvePromotionStatus(promotion, now),
    cancelledAt: promotion.cancelledAt ?? null,
    endedAt: promotion.endedAt ?? null,
    createdAt: promotion.createdAt,
    updatedAt: promotion.updatedAt,
  };
}
