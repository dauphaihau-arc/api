import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import {
  ORDER_CREATED_INVENTORY_EVENT_TYPE,
  type OrderCreatedInventoryEvent,
} from '../events/order-created-inventory.event';
import { OrderInventoryEventPublisher } from '../ports/order-inventory-event.publisher';
import {
  OutboxEventEntity,
  OutboxEventStatus,
} from '../../infra/persistence/entities/outbox-event.entity';

const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [15_000, 60_000, 300_000, 900_000, 3_600_000];

@Injectable()
export class OrderInventoryOutboxPublisherService {
  private readonly logger = new Logger(OrderInventoryOutboxPublisherService.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly orderInventoryEventPublisher: OrderInventoryEventPublisher,
  ) {}

  async processPendingEvents(limit = 10): Promise<number> {
    const entityManager = this.entityManager.fork();
    const pendingEvents = await entityManager.find(
      OutboxEventEntity,
      {
        eventName: ORDER_CREATED_INVENTORY_EVENT_TYPE,
        status: OutboxEventStatus.PENDING,
        availableAt: { $lte: new Date() },
      },
      {
        orderBy: { createdAt: 'asc' },
        limit,
      },
    );

    let processedCount = 0;

    for (const event of pendingEvents) {
      if (await this.processEventById(event.id)) {
        processedCount += 1;
      }
    }

    return processedCount;
  }

  async processEventById(eventId: string): Promise<boolean> {
    const claimed = await this.claimEvent(eventId);

    if (!claimed) {
      return false;
    }

    try {
      await this.orderInventoryEventPublisher.publish(claimed.payload);
      await this.markProcessed(claimed.eventId);
      return true;
    }
    catch (error) {
      await this.markProcessingFailure(
        claimed.eventId,
        claimed.attemptCount,
        error,
      );

      return false;
    }
  }

  private async claimEvent(eventId: string): Promise<{
    eventId: string;
    attemptCount: number;
    payload: OrderCreatedInventoryEvent;
  } | null> {
    return this.entityManager.fork().transactional(async (entityManager) => {
      const event = await entityManager.findOne(
        OutboxEventEntity,
        { id: eventId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );

      if (!event) {
        return null;
      }

      if (
        event.eventName !== ORDER_CREATED_INVENTORY_EVENT_TYPE
        || event.status === OutboxEventStatus.PROCESSED
        || event.status === OutboxEventStatus.FAILED
      ) {
        return null;
      }

      if (event.availableAt > new Date()) {
        return null;
      }

      event.status = OutboxEventStatus.PROCESSING;
      event.attemptCount += 1;
      event.lastError = undefined;

      await entityManager.flush();

      return {
        eventId: event.id,
        attemptCount: event.attemptCount,
        payload: event.payload as unknown as OrderCreatedInventoryEvent,
      };
    });
  }

  private async markProcessed(eventId: string): Promise<void> {
    await this.entityManager.fork().transactional(async (entityManager) => {
      const event = await entityManager.findOneOrFail(
        OutboxEventEntity,
        { id: eventId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );

      event.status = OutboxEventStatus.PROCESSED;
      event.processedAt = new Date();
      event.lastError = undefined;

      await entityManager.flush();
    });
  }

  private async markProcessingFailure(
    eventId: string,
    attemptCount: number,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error
      ? error.message
      : 'Unknown inventory outbox publish failure';
    const stack = error instanceof Error ? error.stack : undefined;

    this.logger.error(
      `Failed publishing inventory outbox event ${eventId}: ${message}`,
      stack,
    );

    await this.entityManager.fork().transactional(async (entityManager) => {
      const event = await entityManager.findOneOrFail(
        OutboxEventEntity,
        { id: eventId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );

      event.lastError = message;

      if (attemptCount >= MAX_RETRY_ATTEMPTS) {
        event.status = OutboxEventStatus.FAILED;
        await entityManager.flush();
        return;
      }

      event.status = OutboxEventStatus.PENDING;
      event.availableAt = new Date(
        Date.now() +
          RETRY_DELAYS_MS[
            Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1)
          ],
      );

      await entityManager.flush();
    });
  }
}
