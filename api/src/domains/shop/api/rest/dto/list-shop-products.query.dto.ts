import { Expose, Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ProductState } from '~/domains/product/domain/enums/product-state.enum';
import { CATEGORY_PUBLIC_ID_PATTERN } from '~/domains/category/app/category-public-id';
import {
  SHOP_PRODUCT_LIST_DEFAULT_LIMIT,
  SHOP_PRODUCT_LIST_DEFAULT_PAGE,
  SHOP_PRODUCT_LIST_MAX_LIMIT,
} from '../../../../product/app/product.constants';

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
  @Matches(CATEGORY_PUBLIC_ID_PATTERN)
  categoryId?: string;

  @IsOptional()
  @Transform(({ value, obj: source }) => value ?? source.s)
  @IsString()
  search?: string;
}
