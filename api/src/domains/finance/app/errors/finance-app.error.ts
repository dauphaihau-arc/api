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
