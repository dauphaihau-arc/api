import { Transform, Type } from 'class-transformer';
import {
  IsBoolean, IsInt, IsOptional, IsString, Max, Min 
} from 'class-validator';

export class ListShopCouponsQueryDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  is_auto_sale?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
