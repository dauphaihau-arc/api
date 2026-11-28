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
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ProductWhoMade } from '~/domains/product/domain/enums/product-who-made.enum';
import { CATEGORY_PUBLIC_ID_PATTERN } from '~/domains/category/app/category-public-id';
import {
  PRODUCT_PUBLIC_LIST_DEFAULT_LIMIT,
  PRODUCT_PUBLIC_LIST_DEFAULT_PAGE,
  PRODUCT_PUBLIC_LIST_MAX_LIMIT,
} from '../../../../app/product.constants';
import type { PublicProductSortOrder } from '../../../../app/product.types';

export const PUBLIC_PRODUCT_SORT_ORDERS: PublicProductSortOrder[] = [
  'newest',
  'price_asc',
  'price_desc',
];

/** Accepted `catalog_ship_to` input: `all` (any case) or two letters (any case). */
export const CATALOG_SHIP_TO_PATTERN = /^(?:all|[A-Za-z]{2})$/;

function toOptionalCatalogShipTo(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    // Leave non-strings untouched so `@IsString` rejects them.
    return value as string | undefined;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed.toLowerCase() === 'all' ? 'all' : trimmed.toUpperCase();
}

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
  @Matches(CATEGORY_PUBLIC_ID_PATTERN)
  categoryId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value, obj: source }) => value ?? source.s)
  search?: string;

  @IsOptional()
  @IsString()
  // `s` is a public query alias kept for backward-compatible API input.
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
  @ApiPropertyOptional({
    name: 'catalog_ship_to',
    description:
      'Catalog-only destination filter. An ISO 3166-1 alpha-2 country ' +
      'restricts results to products that ship there; `all` disables coverage ' +
      'filtering. Omit to follow the request Market\'s Preview Destination.',
  })
  @Expose({ name: 'catalog_ship_to' })
  @Transform(({ value, obj: source }) =>
    toOptionalCatalogShipTo(
      value ?? source.catalog_ship_to ?? source.catalogShipTo,
    ),
  )
  @IsString()
  @Matches(CATALOG_SHIP_TO_PATTERN)
  catalogShipTo?: string;

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
