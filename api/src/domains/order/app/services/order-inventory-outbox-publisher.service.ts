import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import {
  ORDER_CREATED_INVENTORY_EVENT_TYPE,
  type OrderCreatedInventoryEvent,
} from '../events/order-created-inventory.event';
import { OrderInventoryEventPublisher } from '../ports/order-inventory-event.publisher';
import { OutboxEventStatus } from '../../../../platform/outbox/outbox-event.entity';
import {
  DURABLE_OUTBOX_BATCH_SIZE,
  DurableOutboxProcessor,
} from '../../../../platform/outbox/durable-outbox.processor';

@Injectable()
export class OrderInventoryOutboxPublisherService {
  private readonly logger = new Logger(OrderInventoryOutboxPublisherService.name);
  private readonly outboxProcessor: DurableOutboxProcessor;

  constructor(
    private readonly entityManager: EntityManager,
    private readonly orderInventoryEventPublisher: OrderInventoryEventPublisher,
  ) {
    this.outboxProcessor = new DurableOutboxProcessor(
      entityManager,
      this.logger,
      {
        eventName: ORDER_CREATED_INVENTORY_EVENT_TYPE,
        // A crashed publish is not recovered: only pending events are scanned.
        dueStatuses: [OutboxEventStatus.PENDING],
        failureLogPrefix: 'Failed publishing inventory outbox event',
        unknownErrorMessage: 'Unknown inventory outbox publish failure',
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
    const claimed = await this.outboxProcessor.claim<OrderCreatedInventoryEvent>(
      eventId,
    );

    if (!claimed) {
      return false;
    }

    try {
      await this.orderInventoryEventPublisher.publish(claimed.payload);
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
