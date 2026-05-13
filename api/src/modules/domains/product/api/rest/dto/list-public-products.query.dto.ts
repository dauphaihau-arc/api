import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min
} from 'class-validator';
import { ProductWhoMade } from '~/modules/domains/product/domain/enums/product-who-made.enum';
import {
  PRODUCT_PUBLIC_LIST_DEFAULT_LIMIT,
  PRODUCT_PUBLIC_LIST_DEFAULT_PAGE,
  PRODUCT_PUBLIC_LIST_MAX_LIMIT,
  type PublicProductSortOrder
} from '../../../app/product.types';

const PUBLIC_PRODUCT_SORT_ORDERS: PublicProductSortOrder[] = [
  'newest',
  'price_asc',
  'price_desc',
];

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }
  }

  return value as boolean;
}

export class ListPublicProductsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page: number = PRODUCT_PUBLIC_LIST_DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(PRODUCT_PUBLIC_LIST_MAX_LIMIT)
  limit: number = PRODUCT_PUBLIC_LIST_DEFAULT_LIMIT;

  @IsOptional()
  @Transform(({ value, obj: source }) => value ?? source.category_id)
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value, obj: source }) => value ?? source.s)
  search?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @Transform(({ value, obj: source }) =>
    toOptionalBoolean(value ?? source.is_digital)
  )
  @IsBoolean()
  isDigital?: boolean;

  @IsOptional()
  @IsEnum(ProductWhoMade)
  whoMade?: ProductWhoMade;

  @IsOptional()
  @IsIn(PUBLIC_PRODUCT_SORT_ORDERS)
  order?: PublicProductSortOrder;
}
