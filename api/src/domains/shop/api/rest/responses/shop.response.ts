import { ApiProperty } from '@nestjs/swagger';
import type { ShopSummary } from '../../../app/shop.types';

export class ShopResponseDto {
  @ApiProperty({ description: 'Shop public id (shop_…).' })
  id!: string;

  @ApiProperty({ description: 'Owning user internal id.' })
  owner_user_id!: string;

  @ApiProperty()
  shop_name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ description: 'IANA timezone new Sale schedules default to.' })
  timezone!: string;
}

export function toShopResponse(shop: ShopSummary) {
  return {
    id: shop.publicId,
    owner_user_id: shop.ownerUserId,
    shop_name: shop.shopName,
    slug: shop.slug,
    status: shop.status,
    currency: shop.currency,
    timezone: shop.timezone,
  };
}
