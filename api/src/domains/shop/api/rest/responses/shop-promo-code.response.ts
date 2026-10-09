import type { ShopPromoCodeListResult, ShopPromoCodeSummary } from '../../../app/shop.types';
import type { BulkStopShopPromoCodesResult } from '../../../app/use-cases/bulk-stop-shop-promo-codes/bulk-stop-shop-promo-codes.use-case';

export function toShopPromoCodeResponse(promoCode: ShopPromoCodeSummary) {
  return {
    id: promoCode.publicId,
    shop: promoCode.shopPublicId,
    name: promoCode.name,
    code: promoCode.code,
    benefit_type: promoCode.benefitType,
    percent_off: promoCode.percentOff,
    amount_off: promoCode.amountOff,
    currency: promoCode.currency,
    visibility: promoCode.visibility,
    product_scope: promoCode.productScope,
    product_ids: promoCode.productPublicIds,
    min_order_type: promoCode.minOrderType,
    min_order_value: promoCode.minOrderValue,
    min_purchase_quantity: promoCode.minPurchaseQuantity,
    max_redemptions: promoCode.maxRedemptions,
    max_redemptions_per_buyer: promoCode.maxRedemptionsPerBuyer,
    redemption_count: promoCode.redemptionCount,
    exhausted: promoCode.exhausted,
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

export function toShopPromoCodeStopListResponse(
  result: BulkStopShopPromoCodesResult,
) {
  return {
    results: result.results.map(toShopPromoCodeResponse),
    succeeded_ids: result.succeededIds,
    failed: result.failed.map((failure) => ({
      id: failure.id,
      code: failure.code,
      reason: failure.reason,
    })),
  };
}
