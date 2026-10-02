import type { ShopPromoCodeListResult, ShopPromoCodeSummary } from '../../app/shop.types';

export function toShopPromoCodeResponse(promoCode: ShopPromoCodeSummary) {
  return {
    id: promoCode.id,
    shop: promoCode.shopId,
    name: promoCode.name,
    code: promoCode.code,
    percent_off: promoCode.percentOff,
    currency: promoCode.currency,
    visibility: promoCode.visibility,
    product_scope: promoCode.productScope,
    product_ids: promoCode.productIds,
    start_at: promoCode.startAt,
    end_at: promoCode.endAt,
    timezone: promoCode.timezone,
    status: promoCode.status,
    cancelled_at: promoCode.cancelledAt,
    ended_at: promoCode.endedAt,
    created_at: promoCode.createdAt,
    updated_at: promoCode.updatedAt,
  };
}

export function toShopPromoCodeListResponse(result: ShopPromoCodeListResult) {
  return {
    results: result.results.map(toShopPromoCodeResponse),
    page: result.page,
    limit: result.limit,
    total_pages: result.totalPages,
    total_results: result.totalResults,
  };
}
