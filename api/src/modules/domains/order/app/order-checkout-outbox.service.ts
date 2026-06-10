import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { PaymentGateway } from '~/modules/shared/payment/app/ports/payment-gateway';
import { OrderEventActorType } from '../domain/enums/order-event-actor-type.enum';
import { OrderEventType } from '../domain/enums/order-event-type.enum';
import { OrderStatus } from '../domain/enums/order-status.enum';
import { OrderEntity } from '../infra/persistence/entities/order.entity';
import {
  OutboxEventEntity,
  OutboxEventStatus
} from '../infra/persistence/entities/outbox-event.entity';
import { OrderEventsService } from './order-events.service';

const CHECKOUT_OUTBOX_EVENT_NAME = 'order.checkout-session-requested';
const CHECKOUT_OUTBOX_AGGREGATE_TYPE = 'order';
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [15_000, 60_000, 300_000, 900_000, 3_600_000];

export interface CheckoutSessionLineItemPayload {
  name: string;
  imageUrl?: string;
  unitAmountMinor: number;
  quantity: number;
}

export interface CheckoutSessionShippingAddressPayload {
  fullName: string;
  address1: string;
  address2?: string;
  city: string;
  country: string;
  state: string;
  zip: string;
  phone: string;
}

export interface CheckoutSessionRequestedPayload {
  userId?: string;
  customerEmail: string;
  cartId: string;
  orderIds: string[];
  currency: string;
  lineItems: CheckoutSessionLineItemPayload[];
  shippingAmountMinor: number;
  discountAmountMinor: number;
  shippingAddress: CheckoutSessionShippingAddressPayload;
}

@Injectable()
export class OrderCheckoutOutboxService {
  private readonly logger = new Logger(OrderCheckoutOutboxService.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly paymentGateway: PaymentGateway,
    private readonly orderEventsService: OrderEventsService
  ) {}

  async createCheckoutSessionRequestedEvent(
    entityManager: EntityManager,
    payload: CheckoutSessionRequestedPayload
  ): Promise<OutboxEventEntity> {
    const outboxEvent = entityManager.create(OutboxEventEntity, {
      eventName: CHECKOUT_OUTBOX_EVENT_NAME,
      aggregateType: CHECKOUT_OUTBOX_AGGREGATE_TYPE,
      aggregateId: payload.orderIds[0] ?? payload.cartId,
      payload,
      status: OutboxEventStatus.PENDING,
      attemptCount: 0,
      availableAt: new Date(),
    });

    entityManager.persist(outboxEvent);
    await entityManager.flush();

    return outboxEvent;
  }

  async processEventById(
    eventId: string
  ): Promise<{ id: string; url: string } | undefined> {
    const claimed = await this.claimEvent(eventId);

    if (!claimed) {
      return undefined;
    }

    try {
      const checkoutSession = await this.paymentGateway.createStripeCheckoutSession({
        customerEmail: claimed.payload.customerEmail,
        currency: claimed.payload.currency,
        metadata: {
          ...(claimed.payload.userId ? { user_id: claimed.payload.userId } : {}),
          cart_id: claimed.payload.cartId,
        },
        lineItems: claimed.payload.lineItems,
        shippingAmountMinor: claimed.payload.shippingAmountMinor,
        discountAmountMinor: claimed.payload.discountAmountMinor,
        shippingAddress: claimed.payload.shippingAddress,
      });

      await this.entityManager.fork().transactional(async (entityManager) => {
        const event = await entityManager.findOneOrFail(
          OutboxEventEntity,
          { id: claimed.eventId },
          { lockMode: LockMode.PESSIMISTIC_WRITE }
        );
        const orders = await entityManager.find(
          OrderEntity,
          { id: { $in: claimed.payload.orderIds } }
        );

        for (const order of orders) {
          const previousStatus = order.status;
          if (order.status === OrderStatus.CHECKOUT_PENDING) {
            order.status = OrderStatus.AWAITING_PAYMENT;
            await this.orderEventsService.record(entityManager, {
              order,
              type: OrderEventType.ORDER_STATUS_CHANGED,
              actorType: OrderEventActorType.SYSTEM,
              source: 'checkout_outbox',
              payload: {
                from: previousStatus,
                to: order.status,
                checkout_session_id: checkoutSession.id,
              },
            });
          }

          order.paymentDetails = {
            ...order.paymentDetails,
            checkout_session_id: checkoutSession.id,
            checkout_session_url: checkoutSession.url,
            checkout_session_expires_at: checkoutSession.expiresAt?.toISOString(),
          };
        }

        event.status = OutboxEventStatus.PROCESSED;
        event.processedAt = new Date();
        event.lastError = undefined;

        await entityManager.flush();
      });

      return {
        id: checkoutSession.id,
        url: checkoutSession.url,
      };
    }
    catch (error) {
      await this.markProcessingFailure(
        claimed.eventId,
        claimed.attemptCount,
        error
      );

      return undefined;
    }
  }

  async processPendingEvents(limit = 10): Promise<number> {
    const entityManager = this.entityManager.fork();
    const pendingEvents = await entityManager.find(
      OutboxEventEntity,
      {
        eventName: CHECKOUT_OUTBOX_EVENT_NAME,
        status: OutboxEventStatus.PENDING,
        availableAt: { $lte: new Date() },
      },
      {
        orderBy: { createdAt: 'asc' },
        limit,
      }
    );

    let processedCount = 0;

    for (const event of pendingEvents) {
      const result = await this.processEventById(event.id);
      if (result?.url) {
        processedCount += 1;
      }
    }

    return processedCount;
  }

  private async claimEvent(eventId: string): Promise<{
    eventId: string;
    attemptCount: number;
    payload: CheckoutSessionRequestedPayload;
  } | null> {
    return this.entityManager.fork().transactional(async (entityManager) => {
      const event = await entityManager.findOne(
        OutboxEventEntity,
        { id: eventId },
        { lockMode: LockMode.PESSIMISTIC_WRITE }
      );

      if (!event) {
        return null;
      }

      if (
        event.status === OutboxEventStatus.PROCESSED
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
        payload: event.payload as unknown as CheckoutSessionRequestedPayload,
      };
    });
  }

  private async markProcessingFailure(
    eventId: string,
    attemptCount: number,
    error: unknown
  ): Promise<void> {
    const message = error instanceof Error
      ? error.message
      : 'Unknown checkout outbox failure';
    const stack = error instanceof Error ? error.stack : undefined;

    this.logger.error(
      `Failed processing outbox event ${eventId}: ${message}`,
      stack
    );

    await this.entityManager.fork().transactional(async (entityManager) => {
      const event = await entityManager.findOneOrFail(
        OutboxEventEntity,
        { id: eventId },
        { lockMode: LockMode.PESSIMISTIC_WRITE }
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
          ]
      );

      await entityManager.flush();
    });
  }
}
