import type { JournalEntry } from '../../domain/value-objects/journal-entry';
import type { FinanceRepositoryContext } from './finance-repository-context';

export abstract class JournalEntryRepository {
  /**
   * Records one Journal Entry and its Postings.
   *
   * Returns `true` when this call recorded the entry, and `false` when an entry
   * for the same `moneyEventKey` already existed (a replay). The append is
   * race-safe: concurrent calls for one key must not both record, and a lost
   * race must not abort the surrounding transaction.
   */
  abstract append(
    entry: JournalEntry,
    context: FinanceRepositoryContext,
  ): Promise<boolean>;

  /**
   * Resolves the Seller Payable an Order still holds in the ledger: what its
   * paid Money Event credited, less what any recorded refund of that Order
   * reversed. `null` when the Order has no paid entry. A fully refunded Order
   * resolves to zero, so a later delivery has nothing to make available.
   */
  abstract findOrderSellerPayable(
    orderId: string,
    context?: FinanceRepositoryContext,
  ): Promise<{ shopId: string; currency: string; amountMinor: number } | null>;

  /**
   * Reads the original paid Order's Postings and frozen conversion evidence so
   * a refund reverses that entry rather than re-pricing the Order. `null` when
   * the Order has no recorded paid entry.
   */
  abstract findOrderMoneyBasis(
    orderId: string,
    context?: FinanceRepositoryContext,
  ): Promise<OrderMoneyBasis | null>;

  /**
   * The charge-currency amount of every earlier succeeded refund of this Order,
   * in the order they were recorded. Refunds are always expressed in the
   * currency the buyer paid, so these amounts stay comparable even after the
   * shop changed Settlement Currency; a later refund derives its remaining
   * share from them rather than from Postings already re-denominated.
   */
  abstract findOrderRefundChargeAmounts(
    orderId: string,
    context?: FinanceRepositoryContext,
  ): Promise<number[]>;
}

/**
 * The money facts of a paid Order that a refund reverses: the entry's currency
 * and conversion evidence, and the frozen Postings the refund must mirror.
 * Read from the ledger, never recomputed from today's commission or rates.
 */
export interface OrderMoneyBasis {
  shopId: string;
  currency: string;
  chargeCurrency?: string;
  chargeAmountMinor?: number;
  fxRate?: string;
  commissionMinor: number;
  collectedMinor: number;
  /** The instant the original entry recorded the Money Event. */
  occurredAt: Date;
}
