import { Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class CreateChatConversationDto {
  @ApiProperty({ name: 'shop_id' })
  @Expose({ name: 'shop_id' })
  @Transform(({ value, obj: source }) => value ?? source.shop_id)
  @IsUUID()
  shopId!: string;

  @ApiPropertyOptional({ name: 'product_id' })
  @Expose({ name: 'product_id' })
  @Transform(({ value, obj: source }) => value ?? source.product_id)
  @IsOptional()
  @IsUUID()
  productId?: string;
}
