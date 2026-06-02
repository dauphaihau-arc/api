import { Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class DeleteCartItemQueryDto {
  @ApiProperty({ name: 'inventory_id' })
  @Expose({ name: 'inventory_id' })
  @Transform(({ value, obj: source }) => value ?? source.inventory_id)
  @IsUUID()
  inventoryId!: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'cart_id' })
  @Expose({ name: 'cart_id' })
  @Transform(({ value, obj: source }) => value ?? source.cart_id)
  @IsUUID()
  cartId?: string;
}
