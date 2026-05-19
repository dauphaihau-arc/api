import { Expose, Transform } from 'class-transformer';
import { IsOptional, IsUUID } from 'class-validator';

export class GetCartQueryDto {
  @IsOptional()
  @Expose({ name: 'cart_id' })
  @Transform(({ value, obj: source }) => value ?? source.cart_id)
  @IsUUID()
  cartId?: string;
}
