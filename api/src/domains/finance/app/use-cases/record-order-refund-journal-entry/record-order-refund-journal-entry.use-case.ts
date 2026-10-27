import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { LedgerAccountKind } from '../../../domain/enums/ledger-account-kind.enum';
import {
  buildOrderRefundPostings,
  computeProRataCommissionReversalMinor,
  convertMinorUnitsAtRate,
  orderRefundMoneyEventKey,
} from '../../../domain/rules/order-refund-postings';
import {
  assertBalancedJournalEntry,
  type JournalEntry,
} from '../../../domain/value-objects/journal-entry';
import type { OrderRefundMoneyEvent } from '../../ports/order-refund-money-event';
import { ORDER_REFUND_MONEY_EVENT_NAME } from '../../ports/order-refund-money-event';
import { JournalEntryRepository } from '../../ports/journal-entry.repository';
import { SellerPayableCommandRepository } from '../../ports/seller-payable-command.repository';
import {
  SettlementCurrencyRepository,
  type SettlementCurrencyCutoverStep,
} from '../../ports/settlement-currency.repository';
import {
  OrderRefundConversionUnavailableError,
  OrderRefundCurrencyMismatchError,
  PaidOrderPostingNotRecordedError,
  ShopSettlementCurrencyUnresolvedError,
} from '../../errors/finance-app.error';
import { OrderPaidEventRepository } from '../../ports/order-paid-event.repository';

/**
 * Records the money consequences of one succeeded Order Refund: exactly one
 * Journal Entry identified by the refund fact, and the reduction it makes to the
 * shop's Seller Payable. A replay of the same refund records nothing further.
 *
 * The refund is expressed in the currency the buyer paid. It converts at the
 * rate frozen on the Order's original Journal Entry, and through the recorded
 * Cutover Rates when the shop has changed Settlement Currency since, so a refund
 * is never an exchange-rate event and never re-denominates history. Platform
 * Commission is reversed by the refunded share of the commission frozen on the
 * original entry, not by today's schedule.
 */
@Injectable()
export class RecordOrderRefundJournalEntryUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly journalEntryRepository: JournalEntryRepository,
    private readonly sellerPayableRepository: SellerPayableCommandRepository,
    private readonly settlementCurrencyRepository: SettlementCurrencyRepository,
    private readonly orderPaidEventRepository: OrderPaidEventRepository,
  ) {}

  async execute(event: OrderRefundMoneyEvent): Promise<{ recorded: boolean }> {
    return this.entityManager.transactional((entityManager) =>
      this.recordWithin(entityManager, event));
  }

  /**
   * Records the entry on a transaction the caller already opened, so the
   * booking commits or rolls back with the caller's own work. Opens no
   * transaction of its own: every read and write joins `entityManager`.
   */
  async recordWithin(
    entityManager: EntityManager,
    event: OrderRefundMoneyEvent,
  ): Promise<{ recorded: boolean }> {
    if (!Number.isSafeInteger(event.refundedAmountMinor) || event.refundedAmountMinor <= 0) {
      return { recorded: false };
    }

    const basis = await this.journalEntryRepository.findOrderMoneyBasis(
      event.orderId,
      { entityManager },
    );

    if (!basis) {
      const paidEventStatus = await this.orderPaidEventRepository
        .findStatusByOrderId(event.orderId);

      if (paidEventStatus === 'pending' || paidEventStatus === 'processing') {
        throw new PaidOrderPostingNotRecordedError(event.orderId);
      }

      return { recorded: false };
    }

    const paidCurrency = basis.chargeCurrency ?? basis.currency;

    if (event.currency !== paidCurrency) {
      throw new OrderRefundCurrencyMismatchError(
        event.refundId,
        event.currency,
        paidCurrency,
      );
    }

    const settlementCurrency = await this.settlementCurrencyRepository
      .ensureCurrentCurrency(basis.shopId, { entityManager });

    if (!settlementCurrency) {
      throw new ShopSettlementCurrencyUnresolvedError(basis.shopId);
    }

    const cutoverSteps = basis.currency === settlementCurrency
      ? []
      : await this.settlementCurrencyRepository.findCutoverRates(
        basis.shopId,
        basis.currency,
        basis.occurredAt,
        { entityManager },
      );

    if (!cutoverSteps) {
      throw new OrderRefundConversionUnavailableError(
        event.refundId,
        basis.currency,
        settlementCurrency,
      );
    }

    const previousRefundChargeAmounts = await this.journalEntryRepository
      .findOrderRefundChargeAmounts(event.orderId, { entityManager });
    const paidAmountMinor = basis.chargeAmountMinor ?? basis.collectedMinor;
    const previouslyRefundedChargeMinor = previousRefundChargeAmounts
      .reduce((total, amountMinor) => total + amountMinor, 0);
    const previouslyRefundedEntryMinor = previousRefundChargeAmounts.reduce(
      (total, amountMinor) => {
        if (paidCurrency === basis.currency) {
          return total + amountMinor;
        }

        if (!basis.fxRate) {
          throw new OrderRefundConversionUnavailableError(
            event.refundId,
            paidCurrency,
            basis.currency,
          );
        }

        return total + convertMinorUnitsAtRate(
          amountMinor,
          paidCurrency,
          basis.currency,
          basis.fxRate,
        );
      },
      0,
    );
    const remainingCollectedMinor = Math.max(
      basis.collectedMinor - previouslyRefundedEntryMinor,
      0,
    );
    const remainingChargeMinor = Math.max(
      paidAmountMinor - previouslyRefundedChargeMinor,
      0,
    );
    const fullyRefunded = event.refundedAmountMinor >= remainingChargeMinor;
    const previouslyReversedCommissionMinor = previousRefundChargeAmounts
      .reduce(
        (total, amountMinor) => total + computeProRataCommissionReversalMinor(
          basis.commissionMinor,
          amountMinor,
          paidAmountMinor,
        ),
        0,
      );
    const commissionRemainingMinor = Math.max(
      basis.commissionMinor - previouslyReversedCommissionMinor,
      0,
    );

    const converted = this.convertRefund(
      event,
      basis,
      paidAmountMinor,
      fullyRefunded,
      remainingCollectedMinor,
      commissionRemainingMinor,
      cutoverSteps,
    );

    if (converted.refundedMinor <= 0) {
      return { recorded: false };
    }

    const postings = buildOrderRefundPostings({
      shopId: basis.shopId,
      settlementCurrency,
      refundedMinor: converted.refundedMinor,
      commissionReversalMinor: converted.commissionReversalMinor,
    });

    const entry: JournalEntry = {
      moneyEventKey: orderRefundMoneyEventKey(event.orderId, event.refundId),
      moneyEventKind: ORDER_REFUND_MONEY_EVENT_NAME,
      shopId: basis.shopId,
      currency: settlementCurrency,
      chargeCurrency: event.currency,
      chargeAmountMinor: event.refundedAmountMinor,
      occurredAt: new Date(event.occurredAt),
      postings,
    };

    assertBalancedJournalEntry(entry);

    const sellerPayableReductionMinor = postings
      .filter((posting) => posting.account.kind === LedgerAccountKind.SELLER_PAYABLE)
      .reduce((total, posting) => total - posting.amountMinor, 0);

    const recorded = await this.journalEntryRepository.append(entry, {
      entityManager,
    });

    if (!recorded) {
      return { recorded: false };
    }

    await this.sellerPayableRepository.debitForRefund(
      event.orderId,
      basis.shopId,
      settlementCurrency,
      sellerPayableReductionMinor,
      { entityManager },
    );

    await entityManager.flush();

    return { recorded: true };
  }

  /**
   * Converts the refunded amount into the shop's current Settlement Currency.
   *
   * The frozen entry rate carries the charge amount into the currency the Order
   * settled in; the recorded Cutover Rates carry it from there to the shop's
   * current currency. A full refund uses the charge-currency remainder instead
   * of the amount the provider happened to return, so the seller's contribution
   * and the commission charged both reach zero rather than a rounding unit off —
   * including after a Settlement Currency change.
   */
  private convertRefund(
    event: OrderRefundMoneyEvent,
    basis: {
      currency: string;
      chargeCurrency?: string;
      fxRate?: string;
      commissionMinor: number;
      collectedMinor: number;
    },
    paidAmountMinor: number,
    fullyRefunded: boolean,
    remainingCollectedMinor: number,
    commissionRemainingMinor: number,
    cutoverSteps: readonly SettlementCurrencyCutoverStep[],
  ): { refundedMinor: number; commissionReversalMinor: number } {
    let refundedEntryMinor: number;

    if (fullyRefunded) {
      // Reverse what the paid entry actually collected, less the portions
      // already reversed at the frozen rate on earlier refunds.
      refundedEntryMinor = remainingCollectedMinor;
    }
    else if (event.currency === basis.currency) {
      refundedEntryMinor = event.refundedAmountMinor;
    }
    else {
      if (!basis.fxRate) {
        throw new OrderRefundConversionUnavailableError(
          event.refundId,
          event.currency,
          basis.currency,
        );
      }

      refundedEntryMinor = convertMinorUnitsAtRate(
        event.refundedAmountMinor,
        event.currency,
        basis.currency,
        basis.fxRate,
      );
    }

    const commissionReversalEntryMinor = fullyRefunded
      ? commissionRemainingMinor
      : Math.min(
        commissionRemainingMinor,
        computeProRataCommissionReversalMinor(
          basis.commissionMinor,
          event.refundedAmountMinor,
          paidAmountMinor,
        ),
      );

    return {
      refundedMinor: this.applyCutoverSteps(
        refundedEntryMinor,
        basis.currency,
        cutoverSteps,
      ),
      commissionReversalMinor: this.applyCutoverSteps(
        commissionReversalEntryMinor,
        basis.currency,
        cutoverSteps,
      ),
    };
  }

  private applyCutoverSteps(
    amountMinor: number,
    fromCurrency: string,
    steps: readonly SettlementCurrencyCutoverStep[],
  ): number {
    let currency = fromCurrency;
    let converted = amountMinor;

    for (const step of steps) {
      converted = convertMinorUnitsAtRate(converted, currency, step.toCurrency, step.rate);
      currency = step.toCurrency;
    }

    return converted;
  }
}
