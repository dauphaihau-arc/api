import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ShippingDestinationScope } from '../../../domain/enums/shipping-destination-scope.enum';
import { ShippingProfileStatus } from '../../../domain/enums/shipping-profile-status.enum';
import type { ShippingProfileReadinessIssue } from '../../../domain/shipping-profile-readiness';

const shippingProfileReadinessIssues: ShippingProfileReadinessIssue[] = [
  'archived',
  'draft',
  'missing_name',
  'missing_rates',
  'missing_processing_time',
  'invalid_processing_time',
  'missing_delivery_time',
  'invalid_delivery_time',
];

export class ShippingRateResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  position!: number;

  @ApiProperty({ enum: ShippingDestinationScope })
  destination_scope!: ShippingDestinationScope;

  @ApiProperty({ type: String, required: false })
  destination_country?: string;

  @ApiProperty()
  one_item_fee_minor!: number;

  @ApiProperty()
  additional_item_fee_minor!: number;

  @ApiProperty({ type: Number, required: false })
  delivery_time_min_days?: number;

  @ApiProperty({ type: Number, required: false })
  delivery_time_max_days?: number;
}

export class ShippingProfileResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  shop_id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ShippingProfileStatus })
  status!: ShippingProfileStatus;

  @ApiProperty()
  version!: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ type: String, required: false })
  ship_from_country?: string;

  @ApiProperty({ type: String, required: false })
  ship_from_postal?: string;

  @ApiProperty({ type: Number, required: false })
  processing_time_min_days?: number;

  @ApiProperty({ type: Number, required: false })
  processing_time_max_days?: number;

  @ApiProperty()
  checkout_ready!: boolean;

  @ApiProperty({ enum: shippingProfileReadinessIssues, isArray: true })
  readiness_issues!: ShippingProfileReadinessIssue[];

  @ApiProperty()
  is_default!: boolean;

  @ApiProperty()
  assigned_product_count!: number;

  @ApiProperty()
  published_product_count!: number;

  @ApiProperty({ type: [ShippingRateResponseDto] })
  @Type(() => ShippingRateResponseDto)
  rates!: ShippingRateResponseDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at!: Date;
}

export class ShippingProfileStatusCountsResponseDto {
  @ApiProperty()
  active!: number;

  @ApiProperty()
  draft!: number;

  @ApiProperty()
  archived!: number;
}

export class ShippingProfileListResponseDto {
  @ApiProperty({ type: [ShippingProfileResponseDto] })
  @Type(() => ShippingProfileResponseDto)
  results!: ShippingProfileResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total_pages!: number;

  @ApiProperty()
  total_results!: number;

  @ApiProperty({ type: ShippingProfileStatusCountsResponseDto })
  @Type(() => ShippingProfileStatusCountsResponseDto)
  status_counts!: ShippingProfileStatusCountsResponseDto;
}

export class ShippingDurationRangeResponseDto {
  @ApiProperty()
  min_days!: number;

  @ApiProperty()
  max_days!: number;
}

export class ShippingEstimateResponseDto {
  @ApiProperty()
  combined_min_days!: number;

  @ApiProperty()
  combined_max_days!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  anchor_at!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  earliest_delivery_date!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  latest_delivery_date!: Date;
}

export class ShippingRatePreviewResponseDto {
  @ApiProperty()
  shipping_profile_id!: string;

  @ApiProperty()
  shop_id!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  checkout_ready!: boolean;

  @ApiProperty({ enum: shippingProfileReadinessIssues, isArray: true })
  readiness_issues!: ShippingProfileReadinessIssue[];

  @ApiProperty()
  matched!: boolean;

  @ApiProperty({ type: ShippingRateResponseDto, required: false })
  @Type(() => ShippingRateResponseDto)
  rate?: ShippingRateResponseDto;

  @ApiProperty({ type: Number, required: false })
  quantity?: number;

  @ApiProperty({ type: Number, required: false })
  base_item_total_minor?: number;

  @ApiProperty({ type: Number, required: false })
  additional_items_quantity?: number;

  @ApiProperty({ type: Number, required: false })
  additional_items_total_minor?: number;

  @ApiProperty({ type: Number, required: false })
  total_minor?: number;

  @ApiProperty({ type: ShippingDurationRangeResponseDto, required: false })
  @Type(() => ShippingDurationRangeResponseDto)
  processing_time?: ShippingDurationRangeResponseDto;

  @ApiProperty({ type: ShippingDurationRangeResponseDto, required: false })
  @Type(() => ShippingDurationRangeResponseDto)
  delivery_time?: ShippingDurationRangeResponseDto;

  @ApiProperty({ type: ShippingEstimateResponseDto, required: false })
  @Type(() => ShippingEstimateResponseDto)
  estimate?: ShippingEstimateResponseDto;
}

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
