import type { ShopSaleSummary } from './shop.types';
import { resolvePromotionStatus } from '~/domains/promotion/domain/promotion-lifecycle';
import type { PromotionEntity } from '~/domains/promotion/infra/persistence/entities/promotion.entity';

/**
 * The seller-facing view of one Sale: its definition, schedule and retained
 * lifecycle state. Cancel and end never remove the definition, so the same
 * projection serves every sale surface, including stopped Sales.
 */
export function toShopSaleSummary(
  promotion: PromotionEntity,
  products: Array<{ id: string; publicId: string }>,
  now: Date,
): ShopSaleSummary {
  return {
    id: promotion.id,
    publicId: promotion.publicId,
    shopId: promotion.shop.id,
    shopPublicId: promotion.shop.publicId,
    name: promotion.name,
    percentOff: promotion.percentOff ?? 0,
    productScope: promotion.productScope,
    productIds: products.map((product) => product.id),
    productPublicIds: products.map((product) => product.publicId),
    currency: promotion.currency,
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
