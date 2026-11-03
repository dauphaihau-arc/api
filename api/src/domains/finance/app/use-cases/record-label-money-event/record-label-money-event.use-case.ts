import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  LABEL_CHARGED_MONEY_EVENT_NAME,
  LABEL_REFUNDED_MONEY_EVENT_NAME,
  type LabelMoneyEvent,
} from '../../ports/label-money-event';
import { JournalEntryRepository } from '../../ports/journal-entry.repository';
import { SellerPayableCommandRepository } from '../../ports/seller-payable-command.repository';
import {
  buildLabelChargedPostings,
  buildLabelRefundedPostings,
  labelChargeMoneyEventKey,
  labelRefundMoneyEventKey,
} from '../../../domain/rules/label-money-event-postings';
import {
  assertBalancedJournalEntry,
  type JournalEntry,
} from '../../../domain/value-objects/journal-entry';

export type LabelMoneyEventKind = 'charged' | 'refunded';

/**
 * Records the money consequences of one purchased or refunded Label: exactly
 * one Journal Entry identified by the Label's money event, and the available
 * Seller Payable movement it makes. A replay of the same label event records
 * nothing further, so a retried refund can never credit twice.
 *
 * Unlike an Order money event there is nothing to convert: the Label was
 * bought, and is refunded, in the shop's Settlement Currency.
 */
@Injectable()
export class RecordLabelMoneyEventUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly journalEntryRepository: JournalEntryRepository,
    private readonly sellerPayableRepository: SellerPayableCommandRepository,
  ) {}

  async execute(
    event: LabelMoneyEvent,
    kind: LabelMoneyEventKind,
  ): Promise<{ recorded: boolean }> {
    return this.entityManager.transactional((entityManager) =>
      this.recordWithin(entityManager, event, kind));
  }

  async recordWithin(
    entityManager: EntityManager,
    event: LabelMoneyEvent,
    kind: LabelMoneyEventKind,
  ): Promise<{ recorded: boolean }> {
    const charged = kind === 'charged';
    const postings = charged
      ? buildLabelChargedPostings({
        shopId: event.shopId,
        currency: event.currency,
        amountMinor: event.amountMinor,
      })
      : buildLabelRefundedPostings({
        shopId: event.shopId,
        currency: event.currency,
        amountMinor: event.amountMinor,
      });

    const entry: JournalEntry = {
      moneyEventKey: charged
        ? labelChargeMoneyEventKey(event.labelId)
        : labelRefundMoneyEventKey(event.labelId),
      moneyEventKind: charged
        ? LABEL_CHARGED_MONEY_EVENT_NAME
        : LABEL_REFUNDED_MONEY_EVENT_NAME,
      shopId: event.shopId,
      currency: event.currency,
      occurredAt: new Date(event.occurredAt),
      postings,
    };

    assertBalancedJournalEntry(entry);

    const recorded = await this.journalEntryRepository.append(entry, {
      entityManager,
    });

    if (!recorded) {
      return { recorded: false };
    }

    if (charged) {
      await this.sellerPayableRepository.debitAvailable(
        event.shopId,
        event.currency,
        event.amountMinor,
        { entityManager },
      );
    }
    else {
      await this.sellerPayableRepository.creditAvailable(
        event.shopId,
        event.currency,
        event.amountMinor,
        { entityManager },
      );
    }

    await entityManager.flush();

    return { recorded: true };
  }
}
