import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsUUID,
} from 'class-validator';

export class BulkStopShopPromoCodesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  @Transform(({ value }) => Array.isArray(value)
    ? value.map(item => typeof item === 'string' ? item.trim() : item)
    : value)
  ids!: string[];
}
