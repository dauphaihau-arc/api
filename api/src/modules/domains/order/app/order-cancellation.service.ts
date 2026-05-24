import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { CouponUsageEntity } from '../../coupon/infra/persistence/entities/coupon-usage.entity';
import { ProductInventoryEntity } from '../../product/infra/persistence/entities/product-inventory.entity';
import { OrderStatus } from '../domain/enums/order-status.enum';
import { OrderEntity } from '../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../infra/persistence/entities/order-item.entity';

@Injectable()
export class OrderCancellationService {
  async cancelOrder(
    entityManager: EntityManager,
    order: OrderEntity,
    input: {
      canceledAt: Date;
      cancelReason?: string;
      source: 'buyer' | 'seller';
    }
  ): Promise<void> {
    const previousStatus = order.status;

    order.status = OrderStatus.CANCELED;
    order.canceledAt = input.canceledAt;
    order.cancelReason = input.cancelReason?.trim() || order.cancelReason;

    if ([OrderStatus.PENDING, OrderStatus.PAID].includes(previousStatus)) {
      await this.restoreAllocations(entityManager, order.id);
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
  }

  private async restoreAllocations(
    entityManager: EntityManager,
    orderId: string
  ): Promise<void> {
    const orderItems = await entityManager.getRepository(OrderItemEntity).find(
      { order: orderId },
      { populate: ['inventory'] }
    );
    const couponUsages = await entityManager.getRepository(CouponUsageEntity).find(
      { orderId },
      { populate: ['coupon'] }
    );

    for (const item of orderItems) {
      const inventory = await entityManager.getRepository(ProductInventoryEntity).findOne(
        { id: item.inventory.id },
        { lockMode: LockMode.PESSIMISTIC_WRITE }
      );

      if (inventory) {
        inventory.stock += item.quantity;
      }
    }

    for (const usage of couponUsages) {
      usage.coupon.usesCount = Math.max(0, usage.coupon.usesCount - 1);
      entityManager.remove(usage);
    }
  }
}
