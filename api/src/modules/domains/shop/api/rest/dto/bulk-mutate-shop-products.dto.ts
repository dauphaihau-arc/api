import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsString,
} from 'class-validator';
import { BulkMutateShopProductsAction } from '../../../../product/app/use-cases/bulk-mutate-shop-products/bulk-mutate-shop-products.use-case';

export class BulkMutateShopProductsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @Transform(({ value }) => Array.isArray(value)
    ? value.map(item => typeof item === 'string' ? item.trim() : item)
    : value)
  ids!: string[];

  @IsEnum(BulkMutateShopProductsAction)
  action!: BulkMutateShopProductsAction;
}
