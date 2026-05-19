import {
  Expose,
  Transform,
  Type
} from 'class-transformer';
import {
  IsBoolean, IsOptional, IsUUID, Max, Min 
} from 'class-validator';

export class AddCartItemDto {
  @Expose({ name: 'inventory_id' })
  @Transform(({ value, obj: source }) => value ?? source.inventory_id)
  @IsUUID()
  inventoryId!: string;

  @Type(() => Number)
  @Min(1)
  @Max(999)
  quantity!: number;

  @IsOptional()
  @Expose({ name: 'is_temp' })
  @Transform(({ value, obj: source }) => value ?? source.is_temp)
  @IsBoolean()
  isTemp?: boolean;
}
