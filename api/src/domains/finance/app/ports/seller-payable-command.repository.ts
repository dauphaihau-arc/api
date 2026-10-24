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
   * Removes `amountMinor` from a shop's available Seller Payable in one
   * currency, because a Payout paid it. The not-yet-available part is untouched:
   * a Payout never pays money whose availability is not recorded.
   */
  abstract dischargeAvailable(
    shopId: string,
    currency: string,
    amountMinor: number,
    context: FinanceRepositoryContext,
  ): Promise<void>;

  /**
   * Removes `amountMinor` from a shop's Seller Payable in one currency, because
   * an Order Refund gave it back to a buyer.
   *
   * The debit lands in the bucket that holds the refunded Order's money: the
   * Order's Payout Availability, once recorded, lives in the available part, so
   * its refund reduces available; an Order whose availability is not recorded
   * yet lives in the not-yet-available part, so its refund reduces that part and
   * leaves other Orders' available money untouched. The position may go
   * negative, so a refund is never refused because of the shop's account state.
   */
  abstract debitForRefund(
    orderId: string,
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
