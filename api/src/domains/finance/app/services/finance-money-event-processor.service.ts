import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import {
  DURABLE_OUTBOX_BATCH_SIZE,
  DurableOutboxProcessor,
} from '~/platform/outbox/durable-outbox.processor';
import { OutboxEventStatus } from '~/platform/outbox/outbox-event.entity';
import {
  ORDER_DELIVERED_OUTBOX_EVENT_NAME,
  type OrderDeliveredEvent,
} from '../ports/order-delivered-event';
import {
  ORDER_PAID_MONEY_EVENT_NAME,
  type OrderPaidMoneyEvent,
} from '../ports/order-paid-money-event';
import {
  ORDER_REFUND_MONEY_EVENT_NAME,
  type OrderRefundMoneyEvent,
} from '../ports/order-refund-money-event';
import { RecordOrderPaidJournalEntryUseCase } from '../use-cases/record-order-paid-journal-entry/record-order-paid-journal-entry.use-case';
import { RecordOrderRefundJournalEntryUseCase } from '../use-cases/record-order-refund-journal-entry/record-order-refund-journal-entry.use-case';
import { RecordPayoutAvailabilityUseCase } from '../use-cases/record-payout-availability/record-payout-availability.use-case';

/**
 * Claims Finance's money events from the shared durable outbox: `order.paid`
 * records their Journal Entries, `order.refunded` records the reversal of a
 * succeeded Order Refund, `order.delivered` makes their Seller Payable
 * available. Mirrors the Order domain's inventory outbox publisher, but
 * recovers processing events whose lease expired as well as pending ones.
 */
@Injectable()
export class FinanceMoneyEventProcessorService {
  private readonly logger = new Logger(FinanceMoneyEventProcessorService.name);
  private readonly paidOutboxProcessor: DurableOutboxProcessor;
  private readonly refundOutboxProcessor: DurableOutboxProcessor;
  private readonly deliveredOutboxProcessor: DurableOutboxProcessor;

  constructor(
    private readonly entityManager: EntityManager,
    private readonly recordOrderPaidJournalEntryUseCase: RecordOrderPaidJournalEntryUseCase,
    private readonly recordOrderRefundJournalEntryUseCase: RecordOrderRefundJournalEntryUseCase,
    private readonly recordPayoutAvailabilityUseCase: RecordPayoutAvailabilityUseCase,
  ) {
    this.paidOutboxProcessor = new DurableOutboxProcessor(
      entityManager,
      this.logger,
      {
        eventName: ORDER_PAID_MONEY_EVENT_NAME,
        dueStatuses: [OutboxEventStatus.PENDING, OutboxEventStatus.PROCESSING],
        failureLogPrefix: 'Failed processing finance outbox event',
        unknownErrorMessage: 'Unknown finance outbox error',
      },
    );

    this.refundOutboxProcessor = new DurableOutboxProcessor(
      entityManager,
      this.logger,
      {
        eventName: ORDER_REFUND_MONEY_EVENT_NAME,
        dueStatuses: [OutboxEventStatus.PENDING, OutboxEventStatus.PROCESSING],
        failureLogPrefix: 'Failed processing order.refunded outbox event',
        unknownErrorMessage: 'Unknown order.refunded outbox error',
      },
    );

    this.deliveredOutboxProcessor = new DurableOutboxProcessor(
      entityManager,
      this.logger,
      {
        eventName: ORDER_DELIVERED_OUTBOX_EVENT_NAME,
        dueStatuses: [OutboxEventStatus.PENDING, OutboxEventStatus.PROCESSING],
        failureLogPrefix: 'Failed processing order.delivered outbox event',
        unknownErrorMessage: 'Unknown order.delivered outbox error',
      },
    );
  }

  async processPendingEvents(limit = DURABLE_OUTBOX_BATCH_SIZE): Promise<number> {
    const paidCount = await this.paidOutboxProcessor.processDueEvents(
      (eventId) => this.processPaidEventById(eventId),
      limit,
    );
    const refundCount = await this.refundOutboxProcessor.processDueEvents(
      (eventId) => this.processRefundEventById(eventId),
      limit,
    );
    const deliveredCount = await this.deliveredOutboxProcessor.processDueEvents(
      (eventId) => this.processDeliveredEventById(eventId),
      limit,
    );

    return paidCount + refundCount + deliveredCount;
  }

  /**
   * Runs whichever pipeline owns the event. Each claim returns `null` for an
   * event of another name, so a pipeline simply falls through to the next one.
   */
  async processEventById(eventId: string): Promise<boolean> {
    if (await this.processPaidEventById(eventId)) {
      return true;
    }

    if (await this.processRefundEventById(eventId)) {
      return true;
    }

    return this.processDeliveredEventById(eventId);
  }

  private async processPaidEventById(eventId: string): Promise<boolean> {
    const claimed = await this.paidOutboxProcessor.claim<OrderPaidMoneyEvent>(eventId);

    if (!claimed) {
      return false;
    }

    try {
      await this.recordOrderPaidJournalEntryUseCase.execute(claimed.payload);
      await this.paidOutboxProcessor.markProcessed(claimed.eventId);

      return true;
    }
    catch (error) {
      await this.paidOutboxProcessor.markFailed(
        claimed.eventId,
        claimed.attemptCount,
        error,
      );

      return false;
    }
  }

  private async processRefundEventById(eventId: string): Promise<boolean> {
    const claimed = await this.refundOutboxProcessor.claim<OrderRefundMoneyEvent>(eventId);

    if (!claimed) {
      return false;
    }

    try {
      await this.recordOrderRefundJournalEntryUseCase.execute(claimed.payload);
      await this.refundOutboxProcessor.markProcessed(claimed.eventId);

      return true;
    }
    catch (error) {
      await this.refundOutboxProcessor.markFailed(
        claimed.eventId,
        claimed.attemptCount,
        error,
      );

      return false;
    }
  }

  private async processDeliveredEventById(eventId: string): Promise<boolean> {
    const claimed = await this.deliveredOutboxProcessor.claim<OrderDeliveredEvent>(eventId);

    if (!claimed) {
      return false;
    }

    try {
      await this.recordPayoutAvailabilityUseCase.execute(claimed.payload);
      await this.deliveredOutboxProcessor.markProcessed(claimed.eventId);

      return true;
    }
    catch (error) {
      await this.deliveredOutboxProcessor.markFailed(
        claimed.eventId,
        claimed.attemptCount,
        error,
      );

      return false;
    }
  }
}
