import { Expose, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class GetCartQueryDto {
  @IsOptional()
  @ApiPropertyOptional({ name: 'cart_id' })
  @Expose({ name: 'cart_id' })
  @Transform(({ value, obj: source }) => value ?? source.cart_id)
  @IsUUID()
  cartId?: string;
}
