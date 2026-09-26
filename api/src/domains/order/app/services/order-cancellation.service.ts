import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  buildProductInventoryUpdatedSseEvent,
} from '../../../product/app/events/product-inventory-sse.event';
import { CouponUsageEntity } from '../../../coupon/infra/persistence/entities/coupon-usage.entity';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { OrderEntity } from '../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../infra/persistence/entities/order-item.entity';
import { CheckoutStockReservationPort } from '../../../checkout/app/ports/checkout-stock-reservation.port';
import { OrderRefundService } from './order-refund.service';
import { FulfillmentService } from '../../../fulfillment/app/services/fulfillment.service';
import { FulfillmentAggregateStatus } from '../../../fulfillment/domain/enums/fulfillment-aggregate-status.enum';
import { ShipmentUpdateActorType } from '../../../fulfillment/domain/enums/shipment-update-actor-type.enum';
import { ShipmentUpdateSource } from '../../../fulfillment/domain/enums/shipment-update-source.enum';

@Injectable()
export class OrderCancellationService {
  constructor(
    private readonly orderRefundService: OrderRefundService,
    private readonly checkoutStockReservationService: CheckoutStockReservationPort,
    private readonly fulfillmentService: FulfillmentService,
  ) {}

  async cancelOrder(
    entityManager: EntityManager,
    order: OrderEntity,
    input: {
      canceledAt: Date;
      cancelReason?: string;
      source: 'buyer' | 'seller' | 'admin';
      /**
       * Admin status overrides keep their original policy and do not request a
       * refund automatically; buyer/seller cancellation reconciles payment.
       */
      requestRefund?: boolean;
    },
  ): Promise<{
    refundRequested: boolean;
    inventoryEvents: Array<ReturnType<typeof buildProductInventoryUpdatedSseEvent>>;
  }> {
    const previousStatus = order.status;
    let inventoryEvents: Array<ReturnType<typeof buildProductInventoryUpdatedSseEvent>> = [];

    order.status = OrderStatus.CANCELED;
    order.fulfillmentStatus = FulfillmentAggregateStatus.CANCELED;
    order.canceledAt = input.canceledAt;
    order.cancelReason = input.cancelReason?.trim() || order.cancelReason;

    await this.fulfillmentService.voidUndispatchedShipments(entityManager, order.id, {
      actorType: input.source === 'buyer'
        ? ShipmentUpdateActorType.BUYER
        : input.source === 'seller'
          ? ShipmentUpdateActorType.SELLER
          : ShipmentUpdateActorType.ADMIN,
      source: input.source === 'buyer'
        ? ShipmentUpdateSource.BUYER
        : input.source === 'seller'
          ? ShipmentUpdateSource.SELLER
          : ShipmentUpdateSource.ADMIN,
    });

    if ([OrderStatus.PENDING, OrderStatus.PAID].includes(previousStatus)) {
      inventoryEvents = await this.restoreInventory(entityManager, order);
    }

    order.paymentDetails = {
      ...order.paymentDetails,
      cancellation: {
        canceled_at: input.canceledAt.toISOString(),
        reason: order.cancelReason ?? null,
        source: input.source,
        inventory_restored: [OrderStatus.PENDING, OrderStatus.PAID].includes(previousStatus),
      },
    };

    const refundRequested = input.requestRefund === false
      ? false
      : this.orderRefundService.prepareRefundOnCancellation(
        order,
        previousStatus,
        input.canceledAt,
      );

    return { refundRequested, inventoryEvents };
  }

  private async restoreInventory(
    entityManager: EntityManager,
    order: OrderEntity,
  ): Promise<Array<ReturnType<typeof buildProductInventoryUpdatedSseEvent>>> {
    const orderItems = await entityManager.getRepository(OrderItemEntity).find(
      { order: order.id },
      { populate: ['inventory', 'product'] },
    );
    const couponUsages = await entityManager.getRepository(CouponUsageEntity).find(
      { orderId: order.id },
      { populate: ['coupon'] },
    );

    const reservationId = typeof order.paymentDetails?.reservation_id === 'string'
      ? order.paymentDetails.reservation_id
      : undefined;

    const inventoryEvents = await this.checkoutStockReservationService.restoreInventoryForOrderItems(
      entityManager,
      orderItems.map((item) => ({
        inventoryId: item.inventory.id,
        productId: item.product.id,
        quantity: item.quantity,
      })),
      {
        commandId: `${order.id}:restore`,
        cause: 'order_canceled',
        reservationId,
      },
    );

    for (const usage of couponUsages) {
      usage.coupon.usesCount = Math.max(0, usage.coupon.usesCount - 1);
      entityManager.remove(usage);
    }

    return inventoryEvents;
  }
}
