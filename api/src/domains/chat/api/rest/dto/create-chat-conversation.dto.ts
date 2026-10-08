import { Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateChatConversationDto {
  @ApiProperty({ name: 'shop_id', description: 'Shop public id (shop_…)' })
  @Expose({ name: 'shop_id' })
  @Transform(({ value, obj: source }) => value ?? source.shop_id)
  @IsString()
  shopId!: string;

  @ApiPropertyOptional({ name: 'product_id', description: 'Product public id (prod_…)' })
  @Expose({ name: 'product_id' })
  @Transform(({ value, obj: source }) => value ?? source.product_id)
  @IsOptional()
  @IsString()
  productId?: string;
}
