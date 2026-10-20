import type { FinanceRepositoryContext } from './finance-repository-context';
import type {
  PayableOrderAmount,
  PayableShop,
  PayoutRecord,
} from './payout.types';

/**
 * Reads the availability a Payout Run may pay and the Payouts a shop has already
 * been sent. Nothing here writes.
 */
export abstract class PayoutQueryRepository {
  /**
   * Every shop that is owed an available amount no Payout has discharged, with
   * its Settlement Currency. This is the run's scan: only recorded availability
   * is in it, so a not-yet-available balance can never reach a Payout.
   */
  abstract findPayableShops(
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

  /** The shop's Payout history, newest first. */
  abstract findByShopId(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutRecord[]>;
}
