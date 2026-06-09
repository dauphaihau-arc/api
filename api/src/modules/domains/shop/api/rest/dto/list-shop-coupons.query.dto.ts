import { Expose, Transform, Type } from 'class-transformer';
import {
  IsBoolean, IsDate, IsInt, IsOptional, IsString, Max, Min 
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
  @Expose({ name: 'active_from' })
  @Transform(({ value, obj: source }) => value ?? source.active_from)
  @Type(() => Date)
  @IsDate()
  activeFrom?: Date;

  @IsOptional()
  @Expose({ name: 'active_to' })
  @Transform(({ value, obj: source }) => value ?? source.active_to)
  @Type(() => Date)
  @IsDate()
  activeTo?: Date;

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
