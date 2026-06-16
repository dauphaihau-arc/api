import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  buildProductInventoryUpdatedSseEvent
} from '~/modules/domains/product/app/events/product-inventory-sse.event';
import { CouponUsageEntity } from '../../coupon/infra/persistence/entities/coupon-usage.entity';
import { ProductInventoryEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { OrderStatus } from '../domain/enums/order-status.enum';
import { OrderEntity } from '../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../infra/persistence/entities/order-item.entity';
import { OrderRefundService } from './order-refund.service';

@Injectable()
export class OrderCancellationService {
  constructor(private readonly orderRefundService: OrderRefundService) {}

  async cancelOrder(
    entityManager: EntityManager,
    order: OrderEntity,
    input: {
      canceledAt: Date;
      cancelReason?: string;
      source: 'buyer' | 'seller';
    }
  ): Promise<{
    refundRequested: boolean;
    inventoryEvents: Array<ReturnType<typeof buildProductInventoryUpdatedSseEvent>>;
  }> {
    const previousStatus = order.status;
    let inventoryEvents: Array<ReturnType<typeof buildProductInventoryUpdatedSseEvent>> = [];

    order.status = OrderStatus.CANCELED;
    order.canceledAt = input.canceledAt;
    order.cancelReason = input.cancelReason?.trim() || order.cancelReason;

    if ([OrderStatus.PENDING, OrderStatus.PAID].includes(previousStatus)) {
      inventoryEvents = await this.restoreAllocations(entityManager, order.id);
    }

    order.paymentDetails = {
      ...order.paymentDetails,
      cancellation: {
        canceled_at: input.canceledAt.toISOString(),
        reason: order.cancelReason ?? null,
        source: input.source,
        allocations_reverted: [OrderStatus.PENDING, OrderStatus.PAID].includes(previousStatus),
      },
    };

    const refundRequested = this.orderRefundService.prepareRefundOnCancellation(
      order,
      previousStatus,
      input.canceledAt
    );

    return { refundRequested, inventoryEvents };
  }

  private async restoreAllocations(
    entityManager: EntityManager,
    orderId: string
  ): Promise<Array<ReturnType<typeof buildProductInventoryUpdatedSseEvent>>> {
    const orderItems = await entityManager.getRepository(OrderItemEntity).find(
      { order: orderId },
      { populate: ['inventory', 'product'] }
    );
    const couponUsages = await entityManager.getRepository(CouponUsageEntity).find(
      { orderId },
      { populate: ['coupon'] }
    );

    const inventoryEvents: Array<ReturnType<typeof buildProductInventoryUpdatedSseEvent>> = [];

    for (const item of orderItems) {
      const inventory = await entityManager.getRepository(ProductInventoryEntity).findOne(
        { id: item.inventory.id },
        { lockMode: LockMode.PESSIMISTIC_WRITE }
      );

      if (inventory) {
        inventory.stock += item.quantity;
        inventoryEvents.push(buildProductInventoryUpdatedSseEvent({
          productId: item.product.id,
          inventoryId: inventory.id,
          stock: inventory.stock,
        }));
      }
    }

    for (const usage of couponUsages) {
      usage.coupon.usesCount = Math.max(0, usage.coupon.usesCount - 1);
      entityManager.remove(usage);
    }

    return inventoryEvents;
  }
}
