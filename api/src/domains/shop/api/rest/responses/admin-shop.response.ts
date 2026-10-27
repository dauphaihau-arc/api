import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import type { AdminShopListResult } from '../../../app/shop.types';

export class AdminShopListEntryResponseDto {
  @ApiProperty({ description: 'Shop public id (shop_…).' })
  id!: string;

  @ApiProperty()
  shop_name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty({
    description: 'Number of products in the shop, all statuses included.',
  })
  product_count!: number;

  @ApiProperty({
    description: 'Owner email address used for support and triage.',
  })
  owner_email!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Owner display name; null when the account has none.',
  })
  owner_name!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'ISO-8601 instant the shop was created.',
  })
  created_at!: string;
}

export class AdminShopListResponseDto {
  @ApiProperty({ type: [AdminShopListEntryResponseDto] })
  @Type(() => AdminShopListEntryResponseDto)
  results!: AdminShopListEntryResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total_pages!: number;

  @ApiProperty()
  total_results!: number;
}

export function toAdminShopListResponse(result: AdminShopListResult) {
  return {
    results: result.results.map((shop) => ({
      id: shop.id,
      shop_name: shop.shopName,
      slug: shop.slug,
      status: shop.status,
      currency: shop.currency,
      product_count: shop.productCount,
      owner_email: shop.ownerEmail,
      owner_name: shop.ownerName,
      created_at: shop.createdAt.toISOString(),
    })),
    page: result.page,
    limit: result.limit,
    total_pages: result.totalPages,
    total_results: result.totalResults,
  };
}
