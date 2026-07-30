import type { ShopSummary } from '../../app/shop.types';

export function toShopResponse(shop: ShopSummary) {
  return {
    id: shop.id,
    public_id: shop.publicId,
    owner_user_id: shop.ownerUserId,
    shop_name: shop.shopName,
    slug: shop.slug,
    status: shop.status,
    currency: shop.currency,
  };
}
