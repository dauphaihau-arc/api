import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { LedgerAccountKind } from '../../../domain/enums/ledger-account-kind.enum';
import {
  calculateCommissionMinor,
  resolveEffectiveSchedule,
} from '../../../domain/rules/commission-schedule';
import { buildPaidOrderPostings, paidOrderMoneyEventKey } from '../../../domain/rules/paid-order-postings';
import {
  assertBalancedJournalEntry,
  type JournalEntry,
} from '../../../domain/value-objects/journal-entry';
import type { OrderPaidMoneyEvent } from '../../ports/order-paid-money-event';
import { ORDER_PAID_MONEY_EVENT_NAME } from '../../ports/order-paid-money-event';
import { JournalEntryRepository } from '../../ports/journal-entry.repository';
import { CommissionScheduleRepository } from '../../ports/commission-schedule.repository';
import { SellerPayableCommandRepository } from '../../ports/seller-payable-command.repository';

/**
 * Records the money consequences of one paid Order: exactly one Journal Entry
 * identified by the Order's money event, and the credit it makes to the shop's
 * Seller Payable. A replay of the same money event records nothing further.
 *
 * Platform Commission is resolved from the Commission Schedule effective at the
 * Order's money-event instant and frozen into the Postings, so a schedule
 * recorded afterwards never re-prices this Order.
 */
@Injectable()
export class RecordOrderPaidJournalEntryUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly journalEntryRepository: JournalEntryRepository,
    private readonly sellerPayableRepository: SellerPayableCommandRepository,
    private readonly commissionScheduleRepository: CommissionScheduleRepository,
  ) {}

  async execute(event: OrderPaidMoneyEvent): Promise<{ recorded: boolean }> {
    const occurredAt = new Date(event.occurredAt);

    const schedules = await this.commissionScheduleRepository.listByShopId(event.shopId);
    const schedule = resolveEffectiveSchedule(schedules, occurredAt);

    const commissionMinor = schedule
      ? calculateCommissionMinor(event.subtotalMinor - event.discountMinor, schedule.rateBasisPoints)
      : 0;

    const postings = buildPaidOrderPostings({
      shopId: event.shopId,
      currency: event.currency,
      subtotalMinor: event.subtotalMinor,
      discountMinor: event.discountMinor,
      shippingMinor: event.shippingMinor,
      commissionMinor,
    });

    const entry: JournalEntry = {
      moneyEventKey: paidOrderMoneyEventKey(event.orderId),
      moneyEventKind: ORDER_PAID_MONEY_EVENT_NAME,
      shopId: event.shopId,
      currency: event.currency,
      occurredAt,
      postings,
    };

    assertBalancedJournalEntry(entry);

    const payableMinor = postings
      .filter((posting) => posting.account.kind === LedgerAccountKind.SELLER_PAYABLE)
      .reduce((total, posting) => total + posting.amountMinor, 0);

    return this.entityManager.transactional(async (entityManager) => {
      const recorded = await this.journalEntryRepository.append(entry, {
        entityManager,
      });

      if (!recorded) {
        return { recorded: false };
      }

      await this.sellerPayableRepository.creditNotYetAvailable(
        event.shopId,
        event.currency,
        payableMinor,
        { entityManager },
      );

      await entityManager.flush();

      return { recorded: true };
    });
  }
}
