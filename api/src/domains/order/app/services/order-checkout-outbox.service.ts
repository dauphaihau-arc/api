import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { PaymentGateway } from '../../../../integrations/payment/app/ports/payment-gateway';
import {
  DURABLE_OUTBOX_BATCH_SIZE,
  DurableOutboxProcessor,
} from '../../../../platform/outbox/durable-outbox.processor';
import { OrderEventActorType } from '../../domain/enums/order-event-actor-type.enum';
import { OrderEventType } from '../../domain/enums/order-event-type.enum';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { OrderEntity } from '../../infra/persistence/entities/order.entity';
import {
  OutboxEventEntity,
  OutboxEventStatus,
} from '../../../../platform/outbox/outbox-event.entity';
import { OrderEventsService } from './order-events.service';

const CHECKOUT_OUTBOX_EVENT_NAME = 'order.checkout-session-requested';
const CHECKOUT_OUTBOX_AGGREGATE_TYPE = 'order';

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
  private readonly outboxProcessor: DurableOutboxProcessor;

  constructor(
    private readonly entityManager: EntityManager,
    private readonly paymentGateway: PaymentGateway,
    private readonly orderEventsService: OrderEventsService,
  ) {
    this.outboxProcessor = new DurableOutboxProcessor(
      entityManager,
      this.logger,
      {
        eventName: CHECKOUT_OUTBOX_EVENT_NAME,
        // A crashed session creation is recovered once its lease expires.
        dueStatuses: [
          OutboxEventStatus.PENDING,
          OutboxEventStatus.PROCESSING,
        ],
        failureLogPrefix: 'Failed processing outbox event',
        unknownErrorMessage: 'Unknown checkout outbox failure',
      },
    );
  }

  async createCheckoutSessionRequestedEvent(
    entityManager: EntityManager,
    payload: CheckoutSessionRequestedPayload,
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
    eventId: string,
  ): Promise<{ id: string; url: string } | undefined> {
    const claimed =
      await this.outboxProcessor.claim<CheckoutSessionRequestedPayload>(eventId);

    if (!claimed) {
      return undefined;
    }

    try {
      const checkoutSession = await this.paymentGateway.createCheckoutSession({
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
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        const orders = await entityManager.find(
          OrderEntity,
          { id: { $in: claimed.payload.orderIds } },
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

        this.outboxProcessor.applyProcessedState(event);

        await entityManager.flush();
      });

      return {
        id: checkoutSession.id,
        url: checkoutSession.url,
      };
    }
    catch (error) {
      await this.outboxProcessor.markFailed(
        claimed.eventId,
        claimed.attemptCount,
        error,
      );

      return undefined;
    }
  }

  async processPendingEvents(limit = DURABLE_OUTBOX_BATCH_SIZE): Promise<number> {
    return this.outboxProcessor.processDueEvents(async (eventId) => {
      const result = await this.processEventById(eventId);

      return Boolean(result?.url);
    }, limit);
  }
}
