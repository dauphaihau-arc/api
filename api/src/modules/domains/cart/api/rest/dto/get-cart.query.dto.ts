import { Transform } from 'class-transformer';
import { IsOptional, IsUUID } from 'class-validator';

export class GetCartQueryDto {
  @IsOptional()
  @Transform(({ value, obj }) => value ?? obj.cart_id)
  @IsUUID()
  cartId?: string;
}
