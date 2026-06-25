import { Expose, Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ProductWhoMade } from '~/modules/domains/product/domain/enums/product-who-made.enum';
import {
  PRODUCT_PUBLIC_LIST_DEFAULT_LIMIT,
  PRODUCT_PUBLIC_LIST_DEFAULT_PAGE,
  PRODUCT_PUBLIC_LIST_MAX_LIMIT,
  type PublicProductSortOrder,
} from '../../../../app/product.types';

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
  @ApiPropertyOptional({ name: 'category_id' })
  @Expose({ name: 'category_id' })
  @Transform(({ value, obj: source }) => value ?? source.category_id)
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value, obj: source }) => value ?? source.s)
  search?: string;

  @IsOptional()
  @IsString()
  // `s` is a public query alias kept for backward-compatible API input.
  // eslint-disable-next-line id-length
  s?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'is_digital' })
  @Expose({ name: 'is_digital' })
  @Transform(({ value, obj: source }) =>
    toOptionalBoolean(value ?? source.is_digital ?? source.isDigital),
  )
  @IsBoolean()
  isDigital?: boolean;

  @IsOptional()
  @ApiPropertyOptional({ name: 'who_made', enum: ProductWhoMade })
  @Expose({ name: 'who_made' })
  @Transform(({ value, obj: source }) => value ?? source.who_made)
  @IsEnum(ProductWhoMade)
  whoMade?: ProductWhoMade;

  @IsOptional()
  @ApiPropertyOptional({ name: 'min_price' })
  @Expose({ name: 'min_price' })
  @Transform(({ value, obj: source }) => value ?? source.min_price)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @ApiPropertyOptional({ name: 'max_price' })
  @Expose({ name: 'max_price' })
  @Transform(({ value, obj: source }) => value ?? source.max_price)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsArray()
  attributeFilters?: Array<{
    attribute_id?: string;
    selected_option_ids?: string[];
    attribute_name: string;
    selected_option_values: string[];
  }>;

  @IsOptional()
  @IsIn(PUBLIC_PRODUCT_SORT_ORDERS)
  order?: PublicProductSortOrder;
}
