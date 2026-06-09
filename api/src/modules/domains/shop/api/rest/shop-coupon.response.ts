import type {
  ShopCouponListResult,
  ShopCouponSummary
} from '../../app/shop.types';

export function toShopCouponResponse(coupon: ShopCouponSummary) {
  return {
    id: coupon.id,
    shop: coupon.shopId,
    code: coupon.code,
    type: coupon.type,
    applies_to: coupon.appliesTo,
    applies_product_ids: coupon.appliesProductIds,
    amount_off: coupon.amountOff,
    percent_off: coupon.percentOff,
    start_date: coupon.startDate,
    end_date: coupon.endDate,
    max_uses: coupon.maxUses,
    max_uses_per_user: coupon.maxUsesPerUser,
    uses_count: coupon.usesCount,
    min_order_type: coupon.minOrderType,
    min_order_value: coupon.minOrderValue,
    min_products: coupon.minProducts,
    is_active: coupon.isActive,
    is_auto_sale: coupon.isAutoSale,
    created_at: coupon.createdAt,
    updated_at: coupon.updatedAt,
  };
}

export function toShopCouponListResponse(result: ShopCouponListResult) {
  return {
    results: result.results.map(toShopCouponResponse),
    page: result.page,
    limit: result.limit,
    total_pages: result.totalPages,
    total_results: result.totalResults,
    type_counts: result.typeCounts,
  };
}
