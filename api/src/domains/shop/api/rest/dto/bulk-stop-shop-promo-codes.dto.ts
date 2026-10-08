import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  Matches,
} from 'class-validator';

export class BulkStopShopPromoCodesDto {
  @IsArray()
  @ArrayNotEmpty()
  @Matches(/^prm_[0-9a-f]{12}$/, { each: true })
  @Transform(({ value }) => Array.isArray(value)
    ? value.map(item => typeof item === 'string' ? item.trim() : item)
    : value)
  ids!: string[];
}
