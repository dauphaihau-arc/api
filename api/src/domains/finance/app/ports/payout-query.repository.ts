import type { FinanceRepositoryContext } from './finance-repository-context';
import type {
  PayableOrderAmount,
  PayableShop,
  PayoutNotificationFacts,
  PayoutRecord,
} from './payout.types';

/**
 * Reads the availability a Payout Run may pay and the Payouts a shop has already
 * been sent. Nothing here writes.
 */
export abstract class PayoutQueryRepository {
  /**
   * Every shop that opted in to automatic payouts and is owed an available
   * amount no Payout has discharged, with its Settlement Currency. This is the
   * automatic run's scan: only recorded availability is in it, so a
   * not-yet-available balance can never reach a Payout.
   */
  abstract findAutoPayoutShops(
    payoutDayStartUtc: Date,
    context?: FinanceRepositoryContext,
  ): Promise<PayableShop[]>;

  /**
   * The shop's available Orders that are still undischarged, oldest delivery
   * first, so what a Payout pays is attributable Order by Order.
   */
  abstract findPayableOrders(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PayableOrderAmount[]>;

  /**
   * Whether the shop already used its manual withdrawal allowance for the
   * platform month. Only manual rows count: a scheduled Payout is a separate
   * allowance.
   */
  abstract hasConsumedManualPayout(
    shopId: string,
    periodKey: string,
    context?: FinanceRepositoryContext,
  ): Promise<boolean>;

  /** The shop's Payout history, newest first. */
  abstract findByShopId(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutRecord[]>;

  /**
   * The shop owner and Payout facts a terminal notification needs, or `null`
   * when the Payout no longer exists.
   */
  abstract findNotificationFacts(
    payoutId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutNotificationFacts | null>;

  /** One Payout by its internal id, or `null` when it no longer exists. */
  abstract findById(
    payoutId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutRecord | null>;
}
