import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import type { ShopPromoCodeListResult, ShopPromoCodeSummary } from '../../../app/shop.types';
import type { BulkStopShopPromoCodesResult } from '../../../app/use-cases/bulk-stop-shop-promo-codes/bulk-stop-shop-promo-codes.use-case';
import { BulkItemFailureResponseDto } from './shop-bulk.response';

export class ShopPromoCodeResponseDto {
  @ApiProperty({ description: 'Promotion public id (prm_…).' })
  id!: string;

  @ApiProperty({ description: 'Shop public id (shop_…).' })
  shop!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty({ enum: ['percentage', 'fixed_amount', 'free_shipping'] })
  benefit_type!: string;

  @ApiProperty()
  percent_off!: number;

  @ApiProperty({ type: Number, nullable: true })
  amount_off!: number | null;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  visibility!: string;

  @ApiProperty()
  product_scope!: string;

  @ApiProperty({ type: [String], description: 'Product public ids (prod_…).' })
  product_ids!: string[];

  @ApiProperty({ enum: ['none', 'purchase_quantity', 'order_total'] })
  min_order_type!: string;

  @ApiProperty()
  min_order_value!: number;

  @ApiProperty()
  min_purchase_quantity!: number;

  @ApiProperty({ type: Number, nullable: true })
  max_redemptions!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  max_redemptions_per_buyer!: number | null;

  @ApiProperty()
  redemption_count!: number;

  @ApiProperty({ description: 'Whether the code’s allowance is spent.' })
  exhausted!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  start_at!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  end_at!: Date;

  @ApiProperty()
  timezone!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelled_at!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  ended_at!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at!: Date;
}

export class ShopPromoCodeEnvelopeResponseDto {
  @ApiProperty({ type: ShopPromoCodeResponseDto })
  @Type(() => ShopPromoCodeResponseDto)
  promo_code!: ShopPromoCodeResponseDto;
}

export class ShopPromoCodeListResponseDto {
  @ApiProperty({ type: [ShopPromoCodeResponseDto] })
  @Type(() => ShopPromoCodeResponseDto)
  results!: ShopPromoCodeResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total_pages!: number;

  @ApiProperty()
  total_results!: number;
}

export class ShopPromoCodeStopListResponseDto {
  @ApiProperty({ type: [ShopPromoCodeResponseDto] })
  @Type(() => ShopPromoCodeResponseDto)
  results!: ShopPromoCodeResponseDto[];

  @ApiProperty({ type: [String] })
  succeeded_ids!: string[];

  @ApiProperty({ type: [BulkItemFailureResponseDto] })
  @Type(() => BulkItemFailureResponseDto)
  failed!: BulkItemFailureResponseDto[];
}

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
