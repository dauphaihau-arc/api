import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { JobDispatcher } from '../../../../integrations/queue/app/ports/job-dispatcher';
import { OrderEventActorType } from '../../domain/enums/order-event-actor-type.enum';
import { OrderEventType } from '../../domain/enums/order-event-type.enum';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { OrderItemEntity } from '../../infra/persistence/entities/order-item.entity';
import { dispatchBestSellerRankingRefresh } from '../best-seller-ranking-refresh';
import { CheckoutStockReservationPort } from '../../../checkout/app/ports/checkout-stock-reservation.port';
import { FulfillmentService } from '../../../fulfillment/app/services/fulfillment.service';
import { ShipmentUpdateActorType } from '../../../fulfillment/domain/enums/shipment-update-actor-type.enum';
import { ShipmentUpdateSource } from '../../../fulfillment/domain/enums/shipment-update-source.enum';
import { OrderEventsService } from './order-events.service';
import { getRequiredOrderNumber } from '../order-number';
import type { CreateOrderResult } from '../order.types';
import { OrderCartCleanupRepository } from '../ports/order-cart-cleanup.repository';
import { OrderCheckoutSessionRepository } from '../ports/order-checkout-session.repository';
import { OrderInventoryOutboxService } from './order-inventory-outbox.service';

@Injectable()
export class OrderPaymentService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly jobDispatcher: JobDispatcher,
    private readonly checkoutStockReservationService: CheckoutStockReservationPort,
    private readonly orderInventoryOutboxService: OrderInventoryOutboxService,
    private readonly orderEventsService: OrderEventsService,
    private readonly orderCheckoutSessionRepository: OrderCheckoutSessionRepository,
    private readonly orderCartCleanupRepository: OrderCartCleanupRepository,
    private readonly fulfillmentService: FulfillmentService,
  ) {}

  async getOrdersByCheckoutSession(sessionId: string): Promise<CreateOrderResult> {
    const orders = await this.orderCheckoutSessionRepository.findOrdersByCheckoutSession(
      sessionId,
    );

    return {
      orderShops: orders.map((order) => ({
        id: order.id,
        orderNumber: getRequiredOrderNumber(order),
        shopId: order.shop.id,
        shopName: order.shop.shopName,
        shopSlug: order.shop.slug,
      })),
    };
  }

  async markCheckoutSessionCompleted(
    sessionId: string,
    input: {
      paymentIntentId?: string | null;
      paymentStatus?: string | null;
      completedAt?: Date;
    },
  ): Promise<void> {
    await this.entityManager.transactional(async (entityManager) => {
      const orders = await this.orderCheckoutSessionRepository.findOrdersByCheckoutSession(
        sessionId,
        { entityManager },
      );
      const actionableOrders = orders.filter((order) => order.status === OrderStatus.AWAITING_PAYMENT);

      if (actionableOrders.length === 0) {
        return;
      }

      const orderIds = actionableOrders.map((order) => order.id);

      const orderItems = await entityManager.getRepository(OrderItemEntity).find(
        { order: { $in: orderIds } },
        { populate: ['inventory', 'product', 'order'] },
      );

      // Each paid Order consumes its own hold and records its own
      // `order.created`, so the inventory-service moves exactly that Order's
      // reservation to SOLD.
      for (const order of actionableOrders) {
        const reservationId = typeof order.paymentDetails?.reservation_id === 'string'
          ? order.paymentDetails.reservation_id
          : undefined;

        const reservedItems = orderItems
          .filter((item) => item.order.id === order.id)
          .map((item) => ({
            inventoryId: item.inventory.id,
            quantity: item.quantity,
          }));

        await this.checkoutStockReservationService.consumeReservationsForOrder(entityManager, {
          orderId: order.id,
          ...(reservationId ? { reservationId } : {}),
          items: reservedItems,
        });

        await this.orderInventoryOutboxService.createOrderCreatedEvent(entityManager, {
          orderIds: [order.id],
          reservationId,
          items: reservedItems,
        });
      }

      for (const order of actionableOrders) {
        const previousStatus = order.status;

        order.status = OrderStatus.PAID;
        order.paymentDetails = {
          ...order.paymentDetails,
          checkout_session_id: sessionId,
          payment_intent_id: input.paymentIntentId ?? undefined,
          payment_status: input.paymentStatus ?? 'paid',
          paid_at: input.completedAt?.toISOString() ?? new Date().toISOString(),
        };

        await this.orderEventsService.record(entityManager, {
          order,
          type: OrderEventType.PAYMENT_SUCCEEDED,
          actorType: OrderEventActorType.SYSTEM,
          source: 'payment_webhook',
          occurredAt: input.completedAt,
          payload: {
            from_status: previousStatus,
            to_status: order.status,
            payment_intent_id: input.paymentIntentId ?? undefined,
            payment_status: input.paymentStatus ?? 'paid',
            checkout_session_id: sessionId,
          },
        });

        const fulfillmentItems = orderItems
          .filter((item) => item.order.id === order.id)
          .map((item) => ({
            orderItemId: item.id,
            quantity: item.quantity,
          }));
        await this.fulfillmentService.assignSellerGroupToOrder(entityManager, {
          orderId: order.id,
          shopId: order.shop.id,
          items: fulfillmentItems,
          actor: {
            actorType: ShipmentUpdateActorType.SYSTEM,
            source: ShipmentUpdateSource.CHECKOUT,
          },
        });
      }

      const cartId = String(actionableOrders[0]?.paymentDetails?.cart_id ?? '');
      const isTempCart = Boolean(actionableOrders[0]?.paymentDetails?.is_temp_cart);

      const quotedInventoryIds = Array.isArray(actionableOrders[0]?.paymentDetails?.quoted_inventory_ids)
        ? actionableOrders[0]?.paymentDetails?.quoted_inventory_ids as string[]
        : undefined;

      if (cartId) {
        await this.orderCartCleanupRepository.clearCheckoutCart({
          cartId,
          isTempCart,
          inventoryIds: quotedInventoryIds,
        }, { entityManager });
      }

      await entityManager.flush();
    });

    await dispatchBestSellerRankingRefresh(this.jobDispatcher);
  }

  async markCheckoutSessionExpired(
    sessionId: string,
    expiredAt?: Date,
  ): Promise<void> {
    await this.entityManager.transactional(async (entityManager) => {
      const orders = await this.orderCheckoutSessionRepository.findOrdersByCheckoutSession(
        sessionId,
        { entityManager },
      );
      const actionableOrders = orders.filter((order) => order.status === OrderStatus.AWAITING_PAYMENT);

      if (actionableOrders.length === 0) {
        return;
      }

      for (const order of actionableOrders) {
        const reservationId = typeof order.paymentDetails?.reservation_id === 'string'
          ? order.paymentDetails.reservation_id
          : undefined;

        await this.checkoutStockReservationService.releaseReservationsForOrder(
          entityManager,
          order.id,
          {
            ...(expiredAt ? { releasedAt: expiredAt } : {}),
            ...(reservationId ? { reservationId } : {}),
          },
        );
      }

      for (const order of actionableOrders) {
        const previousStatus = order.status;
        order.status = OrderStatus.EXPIRED;

        order.paymentDetails = {
          ...order.paymentDetails,
          checkout_session_id: sessionId,
          payment_status: 'expired',
          expired_at: expiredAt?.toISOString() ?? new Date().toISOString(),
        };

        await this.orderEventsService.record(entityManager, {
          order,
          type: OrderEventType.PAYMENT_EXPIRED,
          actorType: OrderEventActorType.SYSTEM,
          source: 'payment_expiry',
          occurredAt: expiredAt,
          payload: {
            from_status: previousStatus,
            to_status: order.status,
            checkout_session_id: sessionId,
          },
        });
      }

      await entityManager.flush();
    });
  }

}
