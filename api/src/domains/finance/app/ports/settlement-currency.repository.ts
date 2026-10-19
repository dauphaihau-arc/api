import type { FinanceRepositoryContext } from './finance-repository-context';

/**
 * The shop's Settlement Currency: the currency Seller Payable accrues in, read
 * from the shop's dated history rather than from the shop row, so a currency
 * change never rewrites what an earlier Money Event settled in.
 */
export abstract class SettlementCurrencyRepository {
  /**
   * The shop's current Settlement Currency, seeding the shop's opening history
   * row from the shop's own currency when no history exists yet. Race-safe: two
   * concurrent first postings for one shop resolve the same currency.
   *
   * Returns `null` when the shop cannot be read at all; the caller decides what
   * that means, so persistence never raises an application error of its own.
   */
  abstract ensureCurrentCurrency(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<string | null>;
}
