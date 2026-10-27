import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { MoneyConversionService } from '~/integrations/currency/money-conversion.service';
import type { FxRateCache } from '~/integrations/currency/fx-rate.service';
import { LedgerAccountKind } from '../../../domain/enums/ledger-account-kind.enum';
import {
  calculateCommissionMinor,
  resolveEffectiveSchedule,
} from '../../../domain/rules/commission-schedule';
import { buildPaidOrderPostings, paidOrderMoneyEventKey } from '../../../domain/rules/paid-order-postings';
import {
  assertBalancedJournalEntry,
  type JournalEntry,
  type JournalEntryFxEvidence,
} from '../../../domain/value-objects/journal-entry';
import type { OrderPaidMoneyEvent } from '../../ports/order-paid-money-event';
import { ORDER_PAID_MONEY_EVENT_NAME } from '../../ports/order-paid-money-event';
import { JournalEntryRepository } from '../../ports/journal-entry.repository';
import { CommissionScheduleRepository } from '../../ports/commission-schedule.repository';
import { SellerPayableCommandRepository } from '../../ports/seller-payable-command.repository';
import { SettlementCurrencyRepository } from '../../ports/settlement-currency.repository';
import {
  OrderMoneyConversionUnavailableError,
  ShopSettlementCurrencyUnresolvedError,
} from '../../errors/finance-app.error';

/**
 * Records the money consequences of one paid Order: exactly one Journal Entry
 * identified by the Order's money event, and the credit it makes to the shop's
 * Seller Payable. A replay of the same money event records nothing further.
 *
 * The Order's money is converted once into the shop's Settlement Currency,
 * using a single rate for the whole Order, and that rate is frozen on the entry
 * as evidence. Platform Commission is then charged on the converted discounted
 * item subtotal, resolved from the Commission Schedule effective at the Order's
 * money-event instant, so a schedule recorded afterwards never re-prices it.
 */
@Injectable()
export class RecordOrderPaidJournalEntryUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly journalEntryRepository: JournalEntryRepository,
    private readonly sellerPayableRepository: SellerPayableCommandRepository,
    private readonly commissionScheduleRepository: CommissionScheduleRepository,
    private readonly settlementCurrencyRepository: SettlementCurrencyRepository,
    private readonly moneyConversionService: MoneyConversionService,
  ) {}

  async execute(event: OrderPaidMoneyEvent): Promise<{ recorded: boolean }> {
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
    event: OrderPaidMoneyEvent,
  ): Promise<{ recorded: boolean }> {
    const occurredAt = new Date(event.occurredAt);

    const settlementCurrency = await this.settlementCurrencyRepository
      .ensureCurrentCurrency(event.shopId, { entityManager });

    if (!settlementCurrency) {
      throw new ShopSettlementCurrencyUnresolvedError(event.shopId);
    }

    const settled = await this.settleOrderMoney(event, occurredAt, settlementCurrency);

    const schedules = await this.commissionScheduleRepository.listByShopId(
      event.shopId,
      { entityManager },
    );
    const schedule = resolveEffectiveSchedule(schedules, occurredAt);

    const commissionMinor = schedule
      ? calculateCommissionMinor(
        settled.discountedItemSubtotalMinor,
        schedule.rateBasisPoints,
      )
      : 0;

    const postings = buildPaidOrderPostings({
      shopId: event.shopId,
      settlementCurrency,
      discountedItemSubtotalMinor: settled.discountedItemSubtotalMinor,
      shippingMinor: settled.shippingMinor,
      commissionMinor,
    });

    const entry: JournalEntry = {
      moneyEventKey: paidOrderMoneyEventKey(event.orderId),
      moneyEventKind: ORDER_PAID_MONEY_EVENT_NAME,
      shopId: event.shopId,
      currency: settlementCurrency,
      ...settled.evidence,
      occurredAt,
      postings,
    };

    assertBalancedJournalEntry(entry);

    const payableMinor = postings
      .filter((posting) => posting.account.kind === LedgerAccountKind.SELLER_PAYABLE)
      .reduce((total, posting) => total + posting.amountMinor, 0);

    const recorded = await this.journalEntryRepository.append(entry, {
      entityManager,
    });

    if (!recorded) {
      return { recorded: false };
    }

    await this.sellerPayableRepository.creditNotYetAvailable(
      event.shopId,
      settlementCurrency,
      payableMinor,
      { entityManager },
    );

    await entityManager.flush();

    return { recorded: true };
  }

  /**
   * Converts the Order's money into the shop's Settlement Currency. Both amounts
   * convert at the Order's own instant through one shared rate cache, so the
   * whole entry rests on a single rate, and each amount is rounded at the
   * minor-unit edge as ADR-013 requires. The collected charge is kept as
   * evidence only when a conversion actually happened.
   */
  private async settleOrderMoney(
    event: OrderPaidMoneyEvent,
    at: Date,
    settlementCurrency: string,
  ): Promise<{
    discountedItemSubtotalMinor: number;
    shippingMinor: number;
    evidence: Pick<JournalEntry, 'chargeCurrency' | 'chargeAmountMinor' | 'fx'>;
  }> {
    const rateCache: FxRateCache = new Map();
    const discountedItemSubtotalMinor = event.subtotalMinor - event.discountMinor;

    const convertedSubtotal = await this.moneyConversionService.convert({
      amountMinor: discountedItemSubtotalMinor,
      fromCurrency: event.currency,
      toCurrency: settlementCurrency,
      at,
      rateCache,
    });
    const convertedShipping = await this.moneyConversionService.convert({
      amountMinor: event.shippingMinor,
      fromCurrency: event.currency,
      toCurrency: settlementCurrency,
      at,
      rateCache,
    });

    if (!convertedSubtotal || !convertedShipping) {
      throw new OrderMoneyConversionUnavailableError(
        event.orderId,
        event.currency,
        settlementCurrency,
      );
    }

    const fx: JournalEntryFxEvidence | undefined = convertedSubtotal.fx;

    return {
      discountedItemSubtotalMinor: convertedSubtotal.amountMinor,
      shippingMinor: convertedShipping.amountMinor,
      evidence: fx
        ? {
          chargeCurrency: event.currency,
          chargeAmountMinor: event.totalMinor,
          fx,
        }
        : {},
    };
  }
}
