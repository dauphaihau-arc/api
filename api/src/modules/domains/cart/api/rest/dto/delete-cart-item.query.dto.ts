import { Transform } from 'class-transformer';
import { IsOptional, IsUUID } from 'class-validator';

export class DeleteCartItemQueryDto {
  @Transform(({ value, obj }) => value ?? obj.inventory_id)
  @IsUUID()
  inventoryId!: string;

  @IsOptional()
  @Transform(({ value, obj }) => value ?? obj.cart_id)
  @IsUUID()
  cartId?: string;
}
