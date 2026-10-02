import type { ShopPromoCodeSummary } from './shop.types';
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
): ShopPromoCodeSummary {
  return {
    id: promotion.id,
    shopId: promotion.shop.id,
    name: promotion.name,
    code,
    percentOff: promotion.percentOff ?? 0,
    currency: promotion.currency,
    visibility: promotion.visibility ?? 'code_only',
    productScope: promotion.productScope,
    productIds,
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
