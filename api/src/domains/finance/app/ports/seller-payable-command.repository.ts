import type { FinanceRepositoryContext } from './finance-repository-context';

export abstract class SellerPayableCommandRepository {
  /**
   * Adds `amountMinor` to a shop's not-yet-available Seller Payable in one
   * currency, creating the projected position if it does not exist yet. The
   * upsert is race-safe: concurrent credits for one shop and currency must both
   * land rather than one overwriting the other.
   */
  abstract creditNotYetAvailable(
    shopId: string,
    currency: string,
    amountMinor: number,
    context: FinanceRepositoryContext,
  ): Promise<void>;

  /**
   * Moves `amountMinor` from a shop's not-yet-available Seller Payable into its
   * available Seller Payable in one currency: available rises by the amount and
   * not-yet-available falls by it in a single race-safe upsert.
   */
  abstract releaseToAvailable(
    shopId: string,
    currency: string,
    amountMinor: number,
    context: FinanceRepositoryContext,
  ): Promise<void>;
}
