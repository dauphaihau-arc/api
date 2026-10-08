import type { ShopSaleListResult, ShopSaleSummary } from '../../app/shop.types';
import type { BulkStopShopSalesResult } from '../../app/use-cases/bulk-stop-shop-sales/bulk-stop-shop-sales.use-case';

export function toShopSaleResponse(sale: ShopSaleSummary) {
  return {
    id: sale.publicId,
    shop: sale.shopPublicId,
    name: sale.name,
    percent_off: sale.percentOff,
    product_scope: sale.productScope,
    product_ids: sale.productPublicIds,
    currency: sale.currency,
    start_at: sale.startAt,
    end_at: sale.endAt,
    timezone: sale.timezone,
    status: sale.status,
    cancelled_at: sale.cancelledAt,
    ended_at: sale.endedAt,
    created_at: sale.createdAt,
    updated_at: sale.updatedAt,
  };
}

export function toShopSaleListResponse(result: ShopSaleListResult) {
  return {
    results: result.results.map(toShopSaleResponse),
    page: result.page,
    limit: result.limit,
    total_pages: result.totalPages,
    total_results: result.totalResults,
  };
}

export function toShopSaleStopListResponse(
  result: BulkStopShopSalesResult,
) {
  return {
    results: result.results.map(toShopSaleResponse),
    succeeded_ids: result.succeededIds,
    failed: result.failed.map((failure) => ({
      id: failure.id,
      code: failure.code,
      reason: failure.reason,
    })),
  };
}
