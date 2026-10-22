import type { PayoutSource, PayoutState } from '../../domain/rules/payout';

/**
 * The kinds of row the seller transaction timeline shows. Manual Adjustments
 * are deliberately absent: they are not a seller-visible money event yet.
 */
export const TRANSACTION_TYPES = ['order_income', 'refund', 'payout'] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/**
 * Every status a transaction row can carry, across types:
 * `released`/`pending` for Order income, `deducted` for a Refund, and the
 * Payout state for a Payout (`pending`, `paid`, `blocked`, `failed`).
 */
export const TRANSACTION_STATUSES = [
  'released',
  'pending',
  'deducted',
  'paid',
  'blocked',
  'failed',
] as const;

export type TransactionStatus =
  | 'released'
  | 'pending'
  | 'deducted'
  | PayoutState;

/** One row of the seller transaction timeline, already in signed minor units. */
export interface TransactionRecord {
  /** Internal row id; the stable tiebreak of the timeline ordering. */
  id: string;
  occurredAt: Date;
  reference: string;
  /** Human Order number; null on Payout rows. */
  orderNumber: string | null;
  /** Human Payout number; null on Order income and Refund rows. */
  payoutNumber: string | null;
  type: TransactionType;
  status: TransactionStatus;
  /**
   * Gross Order amount: positive for Order income (what the buyer paid) and
   * negative for a Refund; null on Payout rows.
   */
  orderAmountMinor: number | null;
  /**
   * Platform Commission: negative for Order income (fee charged) and positive
   * for a Refund (pro-rata reversal); null on Payout rows.
   */
  feesMinor: number | null;
  /**
   * The Seller Payable posting: positive for Order income, negative for a
   * Refund, and the signed payout amount on Payout rows.
   */
  netAmountMinor: number;
  currency: string;
  /** Where a Payout came from; null on income and refund rows. */
  source: PayoutSource | null;
}

export interface ListShopTransactionsQuery {
  shopId: string;
  /** One-based page number. */
  page: number;
  limit: number;
  type?: TransactionType;
  status?: TransactionStatus;
  /** Inclusive lower bound on the row date. */
  dateFrom?: Date;
  /** Inclusive upper bound on the row date. */
  dateTo?: Date;
}

export interface ShopTransactionsPage {
  transactions: TransactionRecord[];
  /** Rows matching the same shop and filters, across every page. */
  totalResults: number;
}

/**
 * Reads a shop's money movement as one signed timeline over the existing Order,
 * Journal Entry/Posting, Refund, and Payout facts. Nothing here writes, and no
 * amount is converted at read time: the Postings and Payouts already carry the
 * Settlement Currency they were recorded in.
 */
export abstract class TransactionsQueryRepository {
  abstract findPage(query: ListShopTransactionsQuery): Promise<ShopTransactionsPage>;
}
