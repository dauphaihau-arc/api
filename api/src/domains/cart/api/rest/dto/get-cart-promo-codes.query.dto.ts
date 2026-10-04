import { Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class GetCartPromoCodesQueryDto {
  @IsOptional()
  @ApiPropertyOptional({ name: 'cart_id' })
  @Expose({ name: 'cart_id' })
  @Transform(({ value, obj: source }) => value ?? source.cart_id)
  @IsUUID()
  cartId?: string;

  @ApiProperty({ name: 'shop_id' })
  @Expose({ name: 'shop_id' })
  @Transform(({ value, obj: source }) => value ?? source.shop_id)
  @IsUUID()
  shopId!: string;
}
