import { ApiProperty } from '@nestjs/swagger';
import type { TransactionRecord } from '../../../app/ports/transactions-query.repository';

export type ShopTransactionTypeDto = 'order_income' | 'refund' | 'payout';
export type ShopTransactionStatusDto =
  | 'released'
  | 'pending'
  | 'deducted'
  | 'paid'
  | 'blocked'
  | 'failed';

export class ShopTransactionResponseDto {
  @ApiProperty({
    description: 'Instant the money event happened or the Payout was created.',
    example: '2026-10-19T09:15:00.000Z',
  })
  date!: string;

  @ApiProperty({
    description:
      'Order public id for Order income and Refund rows; Payout number for Payout rows.',
    example: 'ord_2f5a91c4b7de',
  })
  reference!: string;

  @ApiProperty({
    description:
      'Human Order number for Order income and Refund rows; null on Payout rows.',
    example: 'ORD-1042',
    nullable: true,
  })
  order_number!: string | null;

  @ApiProperty({
    description:
      'Human Payout number for Payout rows; null on Order income and Refund rows.',
    example: 'PAY-20261019-000042',
    nullable: true,
  })
  payout_number!: string | null;

  @ApiProperty({
    description: 'What moved the money.',
    enum: ['order_income', 'refund', 'payout'],
  })
  type!: ShopTransactionTypeDto;

  @ApiProperty({
    description:
      'Order income: released when the whole Order Payout Availability is ' +
      'recorded, otherwise pending. Refund: deducted. Payout: its own state.',
    example: 'released',
  })
  status!: ShopTransactionStatusDto;

  @ApiProperty({
    description:
      'Gross Order amount in integer minor units of the Settlement Currency: ' +
      'what the buyer paid for Order income (positive), the refunded amount for ' +
      'a Refund (negative); null on Payout rows.',
    example: 12_500,
    nullable: true,
  })
  order_amount_minor!: number | null;

  @ApiProperty({
    description:
      'Platform Commission in integer minor units of the Settlement Currency: ' +
      'negative on Order income (fee charged), positive on a Refund (pro-rata ' +
      'reversal); null on Payout rows.',
    example: -2_500,
    nullable: true,
  })
  fees_minor!: number | null;

  @ApiProperty({
    description:
      'The Seller Payable posting in integer minor units of the Settlement ' +
      'Currency: positive for Order income, negative for a Refund, and the ' +
      'negative payout amount on Payout rows.',
    example: 10_000,
  })
  net_amount_minor!: number;

  @ApiProperty({
    description: 'The Settlement Currency the row was recorded in.',
    example: 'USD',
  })
  currency!: string;

  @ApiProperty({
    description:
      'Whether a scheduled run or a manual withdrawal created the Payout; ' +
      'null on Order income and Refund rows.',
    example: 'manual',
    enum: ['scheduled', 'manual'],
    nullable: true,
  })
  source!: 'scheduled' | 'manual' | null;
}

export class ShopTransactionsResponseDto {
  @ApiProperty({
    description: 'The shop transaction rows, newest first.',
    type: ShopTransactionResponseDto,
    isArray: true,
  })
  transactions!: ShopTransactionResponseDto[];

  @ApiProperty({
    description:
      'Total transaction rows matching the shop and filters, across all pages.',
    example: 42,
  })
  total_results!: number;

  @ApiProperty({
    description: 'One-based page number of this response.',
    example: 1,
  })
  page!: number;

  @ApiProperty({
    description: 'Maximum number of rows requested per page.',
    example: 20,
  })
  limit!: number;
}

export function toShopTransactionResponse(
  transaction: TransactionRecord,
): ShopTransactionResponseDto {
  return {
    date: transaction.occurredAt.toISOString(),
    reference: transaction.reference,
    order_number: transaction.orderNumber,
    payout_number: transaction.payoutNumber,
    type: transaction.type,
    status: transaction.status,
    order_amount_minor: transaction.orderAmountMinor,
    fees_minor: transaction.feesMinor,
    net_amount_minor: transaction.netAmountMinor,
    currency: transaction.currency,
    source: transaction.source,
  };
}

export function toShopTransactionsResponse(result: {
  transactions: TransactionRecord[];
  totalResults: number;
  page: number;
  limit: number;
}): ShopTransactionsResponseDto {
  return {
    transactions: result.transactions.map(toShopTransactionResponse),
    total_results: result.totalResults,
    page: result.page,
    limit: result.limit,
  };
}
