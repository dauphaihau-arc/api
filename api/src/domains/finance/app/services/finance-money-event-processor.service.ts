import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import {
  DURABLE_OUTBOX_BATCH_SIZE,
  DurableOutboxProcessor,
} from '~/platform/outbox/durable-outbox.processor';
import { OutboxEventStatus } from '~/platform/outbox/outbox-event.entity';
import {
  ORDER_PAID_MONEY_EVENT_NAME,
  type OrderPaidMoneyEvent,
} from '../ports/order-paid-money-event';
import { RecordOrderPaidJournalEntryUseCase } from '../use-cases/record-order-paid-journal-entry/record-order-paid-journal-entry.use-case';

/**
 * Claims `order.paid` money events from the shared durable outbox and records
 * their Journal Entries. Mirrors the Order domain's inventory outbox publisher,
 * but recovers processing events whose lease expired as well as pending ones.
 */
@Injectable()
export class FinanceMoneyEventProcessorService {
  private readonly logger = new Logger(FinanceMoneyEventProcessorService.name);
  private readonly outboxProcessor: DurableOutboxProcessor;

  constructor(
    private readonly entityManager: EntityManager,
    private readonly recordOrderPaidJournalEntryUseCase: RecordOrderPaidJournalEntryUseCase,
  ) {
    this.outboxProcessor = new DurableOutboxProcessor(
      entityManager,
      this.logger,
      {
        eventName: ORDER_PAID_MONEY_EVENT_NAME,
        dueStatuses: [OutboxEventStatus.PENDING, OutboxEventStatus.PROCESSING],
        failureLogPrefix: 'Failed processing finance outbox event',
        unknownErrorMessage: 'Unknown finance outbox error',
      },
    );
  }

  async processPendingEvents(limit = DURABLE_OUTBOX_BATCH_SIZE): Promise<number> {
    return this.outboxProcessor.processDueEvents(
      (eventId) => this.processEventById(eventId),
      limit,
    );
  }

  async processEventById(eventId: string): Promise<boolean> {
    const claimed = await this.outboxProcessor.claim<OrderPaidMoneyEvent>(eventId);

    if (!claimed) {
      return false;
    }

    try {
      await this.recordOrderPaidJournalEntryUseCase.execute(claimed.payload);
      await this.outboxProcessor.markProcessed(claimed.eventId);

      return true;
    }
    catch (error) {
      await this.outboxProcessor.markFailed(
        claimed.eventId,
        claimed.attemptCount,
        error,
      );

      return false;
    }
  }
}
