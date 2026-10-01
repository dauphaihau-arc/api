import type { ShopEntity } from '../infra/persistence/entities/shop.entity';
import type { ShopSummary } from './shop.types';

/**
 * The seller-facing view of one Shop. It is the shape both the repository and
 * the store-settings use case return, so a settings write cannot drift from a
 * settings read.
 */
export function toShopSummary(shop: ShopEntity): ShopSummary {
  return {
    id: shop.id,
    publicId: shop.publicId,
    ownerUserId: shop.ownerUser.id,
    shopName: shop.shopName,
    slug: shop.slug,
    status: shop.status,
    currency: shop.currency,
    timezone: shop.timezone,
  };
}
