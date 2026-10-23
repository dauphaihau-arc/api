import type { FinanceRepositoryContext } from './finance-repository-context';

/** One recorded Settlement Currency change, and the rate that crossed it. */
export interface SettlementCurrencyCutoverStep {
  fromCurrency: string;
  toCurrency: string;
  rate: string;
}

/** The history row that is currently open for a shop. */
export interface SettlementCurrencyPeriod {
  currency: string;

  /** When this currency took effect; the change instant for a change row. */
  effectiveFrom: Date;

  /**
   * The currency this row replaced. Absent on a shop's opening row, which is
   * seeded from the shop's own currency rather than from a change, so it does
   * not start the rate-limit interval.
   */
  previousCurrency: string | null;

  /** The provider rate that converted `previousCurrency` into `currency`. */
  cutoverRate: string | null;
}

/** A Settlement Currency change to record as one closed and one opened row. */
export interface RecordSettlementCurrencyChangeInput {
  shopId: string;
  currency: string;
  previousCurrency: string;
  cutoverRate: string;
  effectiveFrom: Date;
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

  /**
   * The shop's open history row, or `null` when the shop has no history yet.
   * `ensureCurrentCurrency` seeds it first, so a shop that recorded money always
   * has one.
   */
  abstract findOpenPeriod(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<SettlementCurrencyPeriod | null>;

  /**
   * Serializes Settlement Currency changes for one shop by locking its shop row
   * for the rest of the caller's transaction. Every change takes this lock
   * before re-reading the history, so two concurrent requests cannot both see
   * an old open row and race a second change into the same interval.
   */
  abstract lockShopForChange(
    shopId: string,
    context: FinanceRepositoryContext,
  ): Promise<void>;

  /**
   * Records a change: closes the open row, opens the new one with its previous
   * currency and Cutover Rate, and moves `shops.currency` to match. Every write
   * joins the caller's transaction, so the history and the shop row cannot
   * disagree.
   */
  abstract recordChange(
    input: RecordSettlementCurrencyChangeInput,
    context: FinanceRepositoryContext,
  ): Promise<SettlementCurrencyPeriod>;
}
