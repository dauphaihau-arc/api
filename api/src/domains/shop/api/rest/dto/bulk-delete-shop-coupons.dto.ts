import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsString,
} from 'class-validator';

export class BulkDeleteShopCouponsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @Transform(({ value }) => Array.isArray(value)
    ? value.map(item => typeof item === 'string' ? item.trim() : item)
    : value)
  ids!: string[];
}
