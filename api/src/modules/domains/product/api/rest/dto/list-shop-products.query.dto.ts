import { Expose, Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min
} from 'class-validator';
import { ProductState } from '~/modules/domains/product/domain/enums/product-state.enum';
import {
  SHOP_PRODUCT_LIST_DEFAULT_LIMIT,
  SHOP_PRODUCT_LIST_DEFAULT_PAGE,
  SHOP_PRODUCT_LIST_MAX_LIMIT
} from '../../../app/product.types';

export class ListShopProductsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page: number = SHOP_PRODUCT_LIST_DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(SHOP_PRODUCT_LIST_MAX_LIMIT)
  limit: number = SHOP_PRODUCT_LIST_DEFAULT_LIMIT;

  @IsOptional()
  @IsEnum(ProductState)
  state?: ProductState;

  @IsOptional()
  @Expose({ name: 'category_id' })
  @Transform(({ value, obj: source }) => value ?? source.category_id)
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(({ value, obj: source }) => value ?? source.s)
  @IsString()
  search?: string;
}
