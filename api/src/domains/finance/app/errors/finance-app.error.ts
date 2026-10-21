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
