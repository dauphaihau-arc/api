import { Type } from 'class-transformer';
import {
  IsOptional, IsString, Max, Min, 
} from 'class-validator';

const ADMIN_SHOP_LIST_DEFAULT_PAGE = 1;
const ADMIN_SHOP_LIST_DEFAULT_LIMIT = 20;
const ADMIN_SHOP_LIST_MAX_LIMIT = 100;

export class ListAdminShopsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page: number = ADMIN_SHOP_LIST_DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(ADMIN_SHOP_LIST_MAX_LIMIT)
  limit: number = ADMIN_SHOP_LIST_DEFAULT_LIMIT;

  @IsOptional()
  @IsString()
  search?: string;
}
