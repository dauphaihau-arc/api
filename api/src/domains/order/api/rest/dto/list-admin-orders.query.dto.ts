import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Max,
  Min,
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
  @Transform(({ value }) => toOptionalStringArray(value))
  @IsArray()
  @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus[];

  @IsOptional()
  @IsString()
  search?: string;
}

function toOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const rawValues = Array.isArray(value) ? value : [value];
  const normalized = rawValues
    .flatMap((entry) => String(entry).split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : undefined;
}
