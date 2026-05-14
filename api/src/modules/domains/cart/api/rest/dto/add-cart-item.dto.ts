import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class AddCartItemDto {
  @Transform(({ value, obj }) => value ?? obj.inventory_id)
  @IsUUID()
  inventoryId!: string;

  @Type(() => Number)
  @Min(1)
  @Max(999)
  quantity!: number;

  @IsOptional()
  @Transform(({ value, obj }) => value ?? obj.is_temp)
  @IsBoolean()
  isTemp?: boolean;
}
