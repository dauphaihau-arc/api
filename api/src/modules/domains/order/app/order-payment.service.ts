import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  buildProductInventoryUpdatedSseEvent,
  PRODUCT_INVENTORY_UPDATED_SSE_EVENT,
} from '~/modules/domains/product/app/events/product-inventory-sse.event';
import { CouponUsageEntity } from '../../coupon/infra/persistence/entities/coupon-usage.entity';
import { ProductInventoryEntity } from '../../product/infra/persistence/entities/product-inventory.entity';
import { OrderStatus } from '../domain/enums/order-status.enum';
import { OrderEntity } from '../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../infra/persistence/entities/order-item.entity';
import type { CreateOrderResult } from './order.types';

@Injectable()
export class OrderPaymentService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async getOrdersByCheckoutSession(sessionId: string): Promise<CreateOrderResult> {
    const entityManager = this.entityManager.fork();
    const orders = await this.findOrdersByCheckoutSession(entityManager, sessionId);

    return {
      orderShops: orders.map((order) => ({
        id: order.id,
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
    }
  ): Promise<void> {
    await this.entityManager.transactional(async (entityManager) => {
      const orders = await this.findOrdersByCheckoutSession(entityManager, sessionId);
      const actionableOrders = orders.filter((order) => order.status === OrderStatus.AWAITING_PAYMENT);

      if (actionableOrders.length === 0) {
        return;
      }

      for (const order of actionableOrders) {
        order.status = OrderStatus.PAID;
        order.paymentDetails = {
          ...order.paymentDetails,
          checkout_session_id: sessionId,
          payment_intent_id: input.paymentIntentId ?? undefined,
          payment_status: input.paymentStatus ?? 'paid',
          paid_at: input.completedAt?.toISOString() ?? new Date().toISOString(),
        };
      }

      const cartId = String(actionableOrders[0]?.paymentDetails?.cart_id ?? '');
      const isTempCart = Boolean(actionableOrders[0]?.paymentDetails?.is_temp_cart);
      const quotedInventoryIds = Array.isArray(actionableOrders[0]?.paymentDetails?.quoted_inventory_ids)
        ? actionableOrders[0]?.paymentDetails?.quoted_inventory_ids as string[]
        : undefined;

      if (cartId) {
        await this.clearCart(entityManager, cartId, isTempCart, quotedInventoryIds);
      }

      await entityManager.flush();
    });
  }

  async markCheckoutSessionExpired(
    sessionId: string,
    expiredAt?: Date
  ): Promise<void> {
    const inventoryEvents = await this.entityManager.transactional(async (entityManager) => {
      const orders = await this.findOrdersByCheckoutSession(entityManager, sessionId);
      const actionableOrders = orders.filter((order) => order.status === OrderStatus.AWAITING_PAYMENT);

      if (actionableOrders.length === 0) {
        return [];
      }

      const orderIds = actionableOrders.map((order) => order.id);
      const orderItems = await entityManager.getRepository(OrderItemEntity).find(
        { order: { $in: orderIds } },
        { populate: ['inventory', 'product'] }
      );
      const couponUsages = await entityManager.getRepository(CouponUsageEntity).find(
        { orderId: { $in: orderIds } },
        { populate: ['coupon'] }
      );

      const inventoryEvents: ReturnType<typeof buildProductInventoryUpdatedSseEvent>[] = [];

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

      for (const order of actionableOrders) {
        order.status = OrderStatus.EXPIRED;
        order.paymentDetails = {
          ...order.paymentDetails,
          checkout_session_id: sessionId,
          payment_status: 'expired',
          expired_at: expiredAt?.toISOString() ?? new Date().toISOString(),
        };
      }

      await entityManager.flush();
      return inventoryEvents;
    });

    for (const inventoryEvent of inventoryEvents) {
      this.eventEmitter.emit(PRODUCT_INVENTORY_UPDATED_SSE_EVENT, inventoryEvent);
    }
  }

  private async findOrdersByCheckoutSession(
    entityManager: EntityManager,
    sessionId: string
  ): Promise<OrderEntity[]> {
    const rows = await entityManager.getConnection().execute<{ id: string }[]>(
      `select id
       from orders
       where payment_details ->> 'checkout_session_id' = ?`,
      [sessionId]
    );
    const orderIds = rows.map((row) => row.id);

    if (orderIds.length === 0) {
      return [];
    }

    return entityManager.getRepository(OrderEntity).find(
      { id: { $in: orderIds } },
      { populate: ['shop'], orderBy: { createdAt: 'asc' } }
    );
  }

  private async clearCart(
    entityManager: EntityManager,
    cartId: string,
    isTempCart: boolean,
    inventoryIds?: string[]
  ): Promise<void> {
    if (isTempCart) {
      await entityManager.getConnection().execute(
        'delete from carts where id = ?',
        [cartId]
      );
      return;
    }

    if (inventoryIds && inventoryIds.length > 0) {
      const placeholders = inventoryIds.map(() => '?').join(', ');
      await entityManager.getConnection().execute(
        `delete from cart_items where cart_id = ? and product_inventory_id in (${placeholders})`,
        [cartId, ...inventoryIds]
      );
    }
    else {
      await entityManager.getConnection().execute(
        'delete from cart_items where cart_id = ? and is_select_order = true',
        [cartId]
      );
    }

    await entityManager.getConnection().execute(
      'delete from carts where id = ? and not exists (select 1 from cart_items where cart_items.cart_id = carts.id)',
      [cartId]
    );
  }
}
