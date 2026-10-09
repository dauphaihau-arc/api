import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import type { ShopSaleListResult, ShopSaleSummary } from '../../../app/shop.types';
import type { BulkStopShopSalesResult } from '../../../app/use-cases/bulk-stop-shop-sales/bulk-stop-shop-sales.use-case';
import { BulkItemFailureResponseDto } from './shop-bulk.response';

export class ShopSaleResponseDto {
  @ApiProperty({ description: 'Sale public id (prm_…).' })
  id!: string;

  @ApiProperty({ description: 'Shop public id (shop_…).' })
  shop!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  percent_off!: number;

  @ApiProperty()
  product_scope!: string;

  @ApiProperty({ type: [String], description: 'Product public ids (prod_…).' })
  product_ids!: string[];

  @ApiProperty()
  currency!: string;

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

export class ShopSaleEnvelopeResponseDto {
  @ApiProperty({ type: ShopSaleResponseDto })
  @Type(() => ShopSaleResponseDto)
  sale!: ShopSaleResponseDto;
}

export class ShopSaleListResponseDto {
  @ApiProperty({ type: [ShopSaleResponseDto] })
  @Type(() => ShopSaleResponseDto)
  results!: ShopSaleResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total_pages!: number;

  @ApiProperty()
  total_results!: number;
}

export class ShopSaleStopListResponseDto {
  @ApiProperty({ type: [ShopSaleResponseDto] })
  @Type(() => ShopSaleResponseDto)
  results!: ShopSaleResponseDto[];

  @ApiProperty({ type: [String] })
  succeeded_ids!: string[];

  @ApiProperty({ type: [BulkItemFailureResponseDto] })
  @Type(() => BulkItemFailureResponseDto)
  failed!: BulkItemFailureResponseDto[];
}

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
