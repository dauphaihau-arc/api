import { Expose, Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import {
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  type TransactionStatus,
  type TransactionType,
} from '../../../app/ports/transactions-query.repository';

export const SHOP_TRANSACTION_LIST_DEFAULT_PAGE = 1;
export const SHOP_TRANSACTION_LIST_DEFAULT_LIMIT = 20;
export const SHOP_TRANSACTION_LIST_MAX_LIMIT = 100;

/**
 * Query of the seller transaction timeline. `date_from`/`date_to` are ISO
 * instants and both bounds are inclusive; the UI sends date-only values as the
 * start and end of that day. Ordering is newest first and pages are one-based.
 */
export class ListShopTransactionsQueryDto {
  @ApiPropertyOptional({
    description: 'One-based page number.',
    default: SHOP_TRANSACTION_LIST_DEFAULT_PAGE,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = SHOP_TRANSACTION_LIST_DEFAULT_PAGE;

  @ApiPropertyOptional({
    description: 'Maximum number of transaction rows to return.',
    default: SHOP_TRANSACTION_LIST_DEFAULT_LIMIT,
    minimum: 1,
    maximum: SHOP_TRANSACTION_LIST_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SHOP_TRANSACTION_LIST_MAX_LIMIT)
  limit: number = SHOP_TRANSACTION_LIST_DEFAULT_LIMIT;

  @ApiPropertyOptional({
    description: 'Only return rows of this type.',
    enum: TRANSACTION_TYPES,
    example: 'order_income',
  })
  @Expose({ name: 'type' })
  @Transform(({ value, obj: source }) => value ?? source.type)
  @IsOptional()
  @IsIn(TRANSACTION_TYPES)
  type?: TransactionType;

  @ApiPropertyOptional({
    description:
      'Only return rows with this status: released/pending for Order income, ' +
      'deducted for refunds, or the Payout state.',
    enum: TRANSACTION_STATUSES,
    example: 'released',
  })
  @Expose({ name: 'status' })
  @Transform(({ value, obj: source }) => value ?? source.status)
  @IsOptional()
  @IsIn(TRANSACTION_STATUSES)
  status?: TransactionStatus;

  @ApiPropertyOptional({
    description: 'Inclusive lower bound on the row date, as an ISO instant.',
    example: '2026-10-01T00:00:00.000Z',
  })
  @Expose({ name: 'date_from' })
  @Transform(({ value, obj: source }) => value ?? source.date_from)
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateFrom?: Date;

  @ApiPropertyOptional({
    description: 'Inclusive upper bound on the row date, as an ISO instant.',
    example: '2026-10-31T23:59:59.999Z',
  })
  @Expose({ name: 'date_to' })
  @Transform(({ value, obj: source }) => value ?? source.date_to)
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateTo?: Date;
}
