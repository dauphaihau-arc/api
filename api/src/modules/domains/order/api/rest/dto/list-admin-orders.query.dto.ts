import { Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Max,
  Min
} from 'class-validator';
import { OrderStatus } from '../../../domain/enums/order-status.enum';

const ADMIN_ORDER_LIST_DEFAULT_PAGE = 1;
const ADMIN_ORDER_LIST_DEFAULT_LIMIT = 20;
const ADMIN_ORDER_LIST_MAX_LIMIT = 100;

export class ListAdminOrdersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page: number = ADMIN_ORDER_LIST_DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(ADMIN_ORDER_LIST_MAX_LIMIT)
  limit: number = ADMIN_ORDER_LIST_DEFAULT_LIMIT;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
