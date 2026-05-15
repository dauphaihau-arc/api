import { Transform } from 'class-transformer';
import { IsOptional, IsUUID } from 'class-validator';

export class DeleteCartItemQueryDto {
  @Transform(({ value, obj: source }) => value ?? source.inventory_id)
  @IsUUID()
  inventoryId!: string;

  @IsOptional()
  @Transform(({ value, obj: source }) => value ?? source.cart_id)
  @IsUUID()
  cartId?: string;
}
