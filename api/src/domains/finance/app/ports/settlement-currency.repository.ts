import type { FinanceRepositoryContext } from './finance-repository-context';

/** One recorded Settlement Currency change, and the rate that crossed it. */
export interface SettlementCurrencyCutoverStep {
  fromCurrency: string;
  toCurrency: string;
  rate: string;
}

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

  /**
   * The Cutover Rates a Money Event recorded in `fromCurrency` at `at` must
   * cross to reach the shop's current Settlement Currency, in order. `at` is the
   * instant the original Journal Entry was recorded, so the history row that was
   * open then is the one whose later changes are crossed — never the row open
   * today. An empty list means the currency never changed since that instant.
   * `null` means the history cannot explain the conversion, which is refused
   * rather than guessed.
   */
  abstract findCutoverRates(
    shopId: string,
    fromCurrency: string,
    at: Date,
    context?: FinanceRepositoryContext,
  ): Promise<SettlementCurrencyCutoverStep[] | null>;
}
