import { Expose, Transform } from 'class-transformer';
import { IsOptional, IsUUID } from 'class-validator';

export class DeleteCartItemQueryDto {
  @Expose({ name: 'inventory_id' })
  @Transform(({ value, obj: source }) => value ?? source.inventory_id)
  @IsUUID()
  inventoryId!: string;

  @IsOptional()
  @Expose({ name: 'cart_id' })
  @Transform(({ value, obj: source }) => value ?? source.cart_id)
  @IsUUID()
  cartId?: string;
}
