import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt, IsOptional, Max, Min,
} from 'class-validator';

const SHOP_SALE_LIST_DEFAULT_PAGE = 1;
const SHOP_SALE_LIST_DEFAULT_LIMIT = 20;
const SHOP_SALE_LIST_MAX_LIMIT = 100;

export class ListShopSalesQueryDto {
  @ApiPropertyOptional({
    description: 'One-based page number.',
    type: Number,
    minimum: 1,
    default: SHOP_SALE_LIST_DEFAULT_PAGE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = SHOP_SALE_LIST_DEFAULT_PAGE;

  @ApiPropertyOptional({
    description: 'Maximum number of sales to return.',
    type: Number,
    minimum: 1,
    maximum: SHOP_SALE_LIST_MAX_LIMIT,
    default: SHOP_SALE_LIST_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SHOP_SALE_LIST_MAX_LIMIT)
  limit = SHOP_SALE_LIST_DEFAULT_LIMIT;
}
