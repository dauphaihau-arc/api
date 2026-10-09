import type {
  ShippingProfileListResult,
  ShippingProfileSummary,
  ShippingProfileView,
} from '../../../app/shipping.types';
import type { ShippingRatePreview } from '../../../app/use-cases/preview-shipping-profile/preview-shipping-profile.use-case';
import type {
  ShippingProfileListResponse,
  ShippingProfileResponse,
  ShippingRatePreviewResponse,
  ShippingRateResponse,
} from '../responses/shipping-profile.response';

export function toShippingProfileResponse(
  view: ShippingProfileView,
): ShippingProfileResponse {
  return {
    id: view.profile.id,
    shop_id: view.profile.shopPublicId,
    name: view.profile.name,
    status: view.profile.status,
    version: view.profile.version,
    currency: view.profile.shopCurrency,
    ship_from_country: view.profile.shipFromCountry,
    ship_from_postal: view.profile.shipFromPostal,
    processing_time_min_days: view.profile.processingTimeMinDays,
    processing_time_max_days: view.profile.processingTimeMaxDays,
    checkout_ready: view.checkoutReady,
    readiness_issues: view.readinessIssues,
    is_default: view.profile.isDefault,
    assigned_product_count: view.assignedProductCount,
    published_product_count: view.publishedProductCount,
    rates: view.profile.rates.map(toShippingRateResponse),
    created_at: view.profile.createdAt,
    updated_at: view.profile.updatedAt,
  };
}

export function toShippingProfileListResponse(
  result: ShippingProfileListResult,
): ShippingProfileListResponse {
  return {
    results: result.results.map(toShippingProfileResponse),
    page: result.page,
    limit: result.limit,
    total_pages: result.totalPages,
    total_results: result.totalResults,
    status_counts: {
      active: result.statusCounts.active,
      draft: result.statusCounts.draft,
      archived: result.statusCounts.archived,
    },
  };
}

export function toShippingRatePreviewResponse(
  preview: ShippingRatePreview,
): ShippingRatePreviewResponse {
  return {
    shipping_profile_id: preview.shippingProfileId,
    shop_id: preview.shopPublicId,
    currency: preview.currency,
    checkout_ready: preview.checkoutReady,
    readiness_issues: preview.readinessIssues,
    matched: preview.matched,
    rate: preview.rate ? toShippingRateResponse(preview.rate) : undefined,
    quantity: preview.arithmetic?.quantity,
    base_item_total_minor: preview.arithmetic?.baseItemTotalMinor,
    additional_items_quantity: preview.arithmetic?.additionalItemsQuantity,
    additional_items_total_minor: preview.arithmetic?.additionalItemsTotalMinor,
    total_minor: preview.arithmetic?.totalMinor,
    processing_time: preview.processingTime
      ? { min_days: preview.processingTime.minDays, max_days: preview.processingTime.maxDays }
      : undefined,
    delivery_time: preview.deliveryTime
      ? { min_days: preview.deliveryTime.minDays, max_days: preview.deliveryTime.maxDays }
      : undefined,
    estimate: preview.estimate
      ? {
        combined_min_days: preview.estimate.combinedMinDays,
        combined_max_days: preview.estimate.combinedMaxDays,
        anchor_at: preview.estimate.anchorAt,
        earliest_delivery_date: preview.estimate.earliestDeliveryDate,
        latest_delivery_date: preview.estimate.latestDeliveryDate,
      }
      : undefined,
  };
}

function toShippingRateResponse(
  rate: ShippingProfileSummary['rates'][number],
): ShippingRateResponse {
  return {
    id: rate.id,
    position: rate.position,
    destination_scope: rate.destinationScope,
    destination_country: rate.destinationCountry,
    one_item_fee_minor: rate.oneItemFeeMinor,
    additional_item_fee_minor: rate.additionalItemFeeMinor,
    delivery_time_min_days: rate.deliveryTimeMinDays,
    delivery_time_max_days: rate.deliveryTimeMaxDays,
  };
}
