import type { ShippingDestinationScope } from '../../domain/enums/shipping-destination-scope.enum';
import type { ShippingProfileStatus } from '../../domain/enums/shipping-profile-status.enum';
import type { ShippingProfileReadinessIssue } from '../../domain/shipping-profile-readiness';

export interface ShippingRateResponse {
  id: string;
  position: number;
  destination_scope: ShippingDestinationScope;
  destination_country?: string;
  one_item_fee_minor: number;
  additional_item_fee_minor: number;
  delivery_time_min_days?: number;
  delivery_time_max_days?: number;
}

export interface ShippingProfileResponse {
  id: string;
  shop_id: string;
  name: string;
  status: ShippingProfileStatus;
  version: number;
  /** Shop currency the minor-unit rate amounts are denominated in. */
  currency: string;
  ship_from_country?: string;
  ship_from_postal?: string;
  processing_time_min_days?: number;
  processing_time_max_days?: number;
  checkout_ready: boolean;
  readiness_issues: ShippingProfileReadinessIssue[];
  /** True when this profile is the shop's Default Shipping Profile. */
  is_default: boolean;
  assigned_product_count: number;
  published_product_count: number;
  rates: ShippingRateResponse[];
  created_at: Date;
  updated_at: Date;
}

export interface ShippingProfileListResponse {
  results: ShippingProfileResponse[];
  page: number;
  limit: number;
  total_pages: number;
  total_results: number;
  /** Counts across every page, so the surface can show that hidden states exist. */
  status_counts: {
    active: number;
    draft: number;
    archived: number;
  };
}

export interface ShippingRatePreviewResponse {
  shipping_profile_id: string;
  shop_id: string;
  currency: string;
  checkout_ready: boolean;
  readiness_issues: ShippingProfileReadinessIssue[];
  matched: boolean;
  rate?: ShippingRateResponse;
  quantity?: number;
  base_item_total_minor?: number;
  additional_items_quantity?: number;
  additional_items_total_minor?: number;
  total_minor?: number;
  processing_time?: ShippingDurationRangeResponse;
  delivery_time?: ShippingDurationRangeResponse;
  estimate?: ShippingEstimateResponse;
}

export interface ShippingDurationRangeResponse {
  min_days: number;
  max_days: number;
}

export interface ShippingEstimateResponse {
  combined_min_days: number;
  combined_max_days: number;
  /** Server-owned UTC instant the estimate was anchored to. */
  anchor_at: Date;
  earliest_delivery_date: Date;
  latest_delivery_date: Date;
}
