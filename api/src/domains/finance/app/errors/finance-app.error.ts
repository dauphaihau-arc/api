import { DomainError } from '~/platform/errors/domain.error';

/**
 * A use case cannot proceed because of orchestration, lookup, or workflow state
 * rather than an invalid value or entity.
 */
export abstract class FinanceAppError extends DomainError {
  protected constructor(message: string) {
    super(message);
  }
}

/**
 * Raised while recording a delivered Order's payout when its `order.paid`
 * Journal Entry is not recorded yet and the paid event that produces it is
 * still pending or in flight. Transient by construction: the shared outbox
 * processor retries the delivery once the paid event lands, so recorded
 * availability is never lost to event ordering.
 */
export class PaidOrderPostingNotRecordedError extends FinanceAppError {
  constructor(orderId: string) {
    super(`Order ${orderId}'s paid posting is not recorded yet`);
  }
}

/**
 * Raised when an Order's money cannot be settled because no exchange rate
 * reaches the shop's Settlement Currency. Transient by construction: rates sync
 * on a schedule, and the shared outbox processor retries the money event, so the
 * ledger never records an amount converted at a rate nobody quoted.
 */
export class OrderMoneyConversionUnavailableError extends FinanceAppError {
  constructor(
    orderId: string,
    chargeCurrency: string,
    settlementCurrency: string,
  ) {
    super(
      `No exchange rate converts Order ${orderId} from ${chargeCurrency} to ${settlementCurrency}`,
    );
  }
}

/**
 * Raised when a shop's active Payout Account was recorded in a currency that no
 * longer matches the shop's Settlement Currency. Reachable only through a
 * Settlement Currency change, and refused rather than shown as if it could be
 * paid into.
 */
export class PayoutAccountCurrencyMismatchError extends FinanceAppError {
  constructor(accountCurrency: string, settlementCurrency: string) {
    super(
      `Payout Account currency ${accountCurrency} does not match the shop's Settlement Currency ${settlementCurrency}`,
    );
  }
}

/**
 * Raised when a shop opts in to automatic payouts without a destination the
 * scheduled run could pay: no open account, an unverified or disabled one, or
 * one in another Settlement Currency.
 */
export class AutoPayoutIneligibleError extends FinanceAppError {
  constructor(shopId: string, reason: string) {
    super(`Shop ${shopId} is not eligible for automatic payouts: ${reason}`);
  }
}

/**
 * Raised when an operator verifies a shop's Payout Account but the shop has
 * none open to verify.
 */
export class PayoutAccountNotFoundError extends FinanceAppError {
  constructor(shopId: string) {
    super(`Shop ${shopId} has no Payout Account to verify`);
  }
}

/**
 * Raised when a shop's Settlement Currency cannot be resolved at all, which
 * means the shop row itself could not be read. An invariant breach rather than
 * a caller-fixable failure, so it is deliberately unmapped and surfaces as a
 * server error.
 */
export class ShopSettlementCurrencyUnresolvedError extends FinanceAppError {
  constructor(shopId: string) {
    super(`Shop ${shopId} has no Settlement Currency to resolve`);
  }
}

/**
 * Raised when a seller asks to withdraw but the shop has no Payout Account that
 * can receive the money. A manual withdrawal is refused before any row is
 * written: a Blocked Payout records a scheduled run's decision, not a seller's
 * request that could never have been sent.
 */
export class PayoutAccountUnusableError extends FinanceAppError {
  constructor(shopId: string, reason: string) {
    super(
      `Shop ${shopId} has no usable Payout Account for a manual withdrawal: ${reason}`,
    );
  }
}

/**
 * Raised when the shop's monthly manual withdrawal allowance is already used.
 * The platform month's allowance is what keeps a manual withdrawal from draining
 * a balance that the next scheduled run should pay.
 */
export class ManualPayoutAlreadyUsedError extends FinanceAppError {
  constructor(shopId: string, periodKey: string) {
    super(
      `Shop ${shopId} already used its manual withdrawal for ${periodKey}`,
    );
  }
}

/**
 * Raised when a manual withdrawal cannot proceed because an earlier Payout is
 * still `pending`: its provider transfer may yet move the same balance.
 */
export class PayoutPendingError extends FinanceAppError {
  constructor(shopId: string) {
    super(
      `Shop ${shopId} has a Payout that is still pending; wait for it to settle before withdrawing again`,
    );
  }
}

/**
 * Raised when a requested manual amount is more than the shop can be paid right
 * now, after netting a negative balance. The caller is told the ceiling rather
 * than having the amount silently reduced.
 */
export class PayoutAmountExceedsAvailableError extends FinanceAppError {
  constructor(amountMinor: number, availableMinor: number) {
    super(
      `Payout amount ${amountMinor} minor units exceeds the available ${availableMinor} minor units`,
    );
  }
}

/**
 * Raised when a seller asks to withdraw but the shop has nothing available to
 * pay: a net position of zero, or availability already discharged by another
 * Payout. Nothing is recorded, because no money would move.
 */
export class NoPayableAmountError extends FinanceAppError {
  constructor(shopId: string) {
    super(`Shop ${shopId} has no available Seller Payable to withdraw`);
  }
}

/**
 * Raised when an Order Refund's amount cannot be expressed in the shop's
 * current Settlement Currency because the recorded rates do not explain the
 * conversion. The refund event stays retryable rather than posting a guessed
 * amount that would move a seller's balance by an exchange rate.
 */
export class OrderRefundConversionUnavailableError extends FinanceAppError {
  constructor(
    refundId: string,
    fromCurrency: string,
    toCurrency: string,
  ) {
    super(
      `Order Refund ${refundId} cannot be converted from ${fromCurrency} to ${toCurrency} using its recorded rates`,
    );
  }
}

/**
 * Raised when a refund event's currency disagrees with the currency the Order
 * was actually charged in. A refund is always expressed in the charge currency,
 * so a mismatch would convert money that never moved.
 */
export class OrderRefundCurrencyMismatchError extends FinanceAppError {
  constructor(refundId: string, refundCurrency: string, chargeCurrency: string) {
    super(
      `Order Refund ${refundId} is recorded in ${refundCurrency} but the Order was charged in ${chargeCurrency}`,
    );
  }
}

/**
 * Raised when a seller asks for a Settlement Currency the marketplace does not
 * accept. The marketplace currency list is the source of truth, so an accepted
 * currency is never inferred from an exchange rate existing for it.
 */
export class SettlementCurrencyUnsupportedError extends FinanceAppError {
  constructor(currency: string) {
    super(`Settlement Currency ${currency} is not accepted by the marketplace`);
  }
}

/**
 * Raised when a seller asks to change to the currency the shop already settles
 * in. Nothing would be recorded, so the request is refused instead of writing a
 * no-op history row.
 */
export class SettlementCurrencyUnchangedError extends FinanceAppError {
  constructor(shopId: string, currency: string) {
    super(`Shop ${shopId} already settles in ${currency}`);
  }
}

/**
 * Raised when a Settlement Currency change is requested while the shop holds
 * Seller Payable in any state — available, not-yet-available, or negative. A
 * change is only ever a zero-balance move, so no money is left in two
 * currencies.
 */
export class SettlementCurrencyBalanceNotZeroError extends FinanceAppError {
  constructor(
    shopId: string,
    availableMinor: number,
    notYetAvailableMinor: number,
  ) {
    super(
      `Shop ${shopId} still holds Seller Payable (${availableMinor} available, ${notYetAvailableMinor} not yet available) and cannot change Settlement Currency`,
    );
  }
}

/**
 * Raised when a Settlement Currency change is requested while a Payout is still
 * `pending`: its provider transfer may yet move money recorded in the retired
 * currency.
 */
export class SettlementCurrencyChangePayoutPendingError extends FinanceAppError {
  constructor(shopId: string) {
    super(
      `Shop ${shopId} has a Payout that is still pending; wait for it to settle before changing Settlement Currency`,
    );
  }
}

/**
 * Raised when a shop asks for a second Settlement Currency change inside the
 * configured interval. The refusal names the instant the next change becomes
 * allowed, so the seller is not left guessing.
 */
export class SettlementCurrencyChangeTooSoonError extends FinanceAppError {
  constructor(shopId: string, nextChangeAllowedAt: Date, intervalDays: number) {
    super(
      `Shop ${shopId} changed Settlement Currency less than ${intervalDays} days ago; the next change is allowed from ${nextChangeAllowedAt.toISOString()}`,
    );
  }
}

/**
 * Raised when no exchange rate converts the retired Settlement Currency into the
 * requested one. Rates sync on a schedule, so the change stays retryable rather
 * than recording a rate nobody quoted.
 */
export class SettlementCurrencyRateUnavailableError extends FinanceAppError {
  constructor(fromCurrency: string, toCurrency: string) {
    super(
      `No exchange rate converts the Settlement Currency from ${fromCurrency} to ${toCurrency}`,
    );
  }
}
