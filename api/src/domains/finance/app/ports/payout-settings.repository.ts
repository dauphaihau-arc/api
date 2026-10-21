import type { FinanceRepositoryContext } from './finance-repository-context';

/** A shop's payout preferences as the application reads them. */
export interface PayoutSettingsRecord {
  shopId: string;
  autoPayoutEnabled: boolean;
  autoPayoutEnabledAt: Date | null;
}

/**
 * Reads and writes the single row of a shop's payout preferences. A shop that
 * never opted in has no row and reads as automatic payouts disabled.
 */
export abstract class PayoutSettingsRepository {
  /** The shop's settings; a missing row means automatic payouts are off. */
  abstract find(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutSettingsRecord>;

  /**
   * Opts the shop in or out, creating its row on first use. Returns the record
   * that was persisted rather than echoing the caller's input.
   */
  abstract setAutoPayoutEnabled(
    shopId: string,
    enabled: boolean,
    enabledAt: Date,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutSettingsRecord>;
}
