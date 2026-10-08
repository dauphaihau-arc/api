import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { OrderFulfillmentViewPort } from '../../../../fulfillment/app/ports/order-fulfillment-view.port';
import { buildOrderFulfillmentSummary, canceledFulfillmentOrderIds } from '../../../../order/app/order-fulfillment';
import { OrderEntity } from '../../../../order/infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../../order/infra/persistence/entities/order-item.entity';
import {
  getOrderDiscountMajor,
  getOrderDiscountMinor,
  getOrderItemAmountMinor,
  getOrderItemOriginalAmountMinor,
  getOrderShippingMajor,
  getOrderShippingMinor,
  getOrderSubtotalMajor,
  getOrderSubtotalMinor,
  getOrderTotalMinor,
  getOrderTotalMajor,
} from '../../../../order/app/order-money';
import { getRequiredOrderNumber } from '../../../../order/app/order-number';
import {
  parsePersistedOrderShippingSnapshot,
} from '../../checkout-shipping-snapshot.contract';
import type { OrderListResult } from '../../../../order/app/order.types';

@Injectable()
export class LookupGuestOrdersUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly orderFulfillmentViewPort: OrderFulfillmentViewPort,
  ) {}

  async execute(input: {
    email?: string;
    orderId?: string;
    orderIds?: string[];
    sessionId?: string;
    zip?: string;
  }): Promise<OrderListResult> {
    const entityManager = this.entityManager.fork();
    const normalizedEmail = input.email?.trim().toLowerCase();
    const normalizedZip = input.zip?.trim().toLowerCase();

    const requestedIds = input.orderIds?.length
      ? input.orderIds
      : input.orderId
        ? [input.orderId]
        : [];

    let orders: OrderEntity[];

    if (input.sessionId) {
      const rows = await entityManager.getConnection().execute<{ id: string }[]>(
        `select id
         from orders
         where payment_details ->> 'checkout_session_id' = ?`,
        [input.sessionId],
      );

      const orderIds = rows.map((row) => row.id);

      orders = orderIds.length > 0
        ? await entityManager.getRepository(OrderEntity).find(
          { id: { $in: orderIds } },
          {
            populate: ['shop'],
            orderBy: { createdAt: 'desc' },
          },
        )
        : [];
    }
    else {
      if (!normalizedEmail) {
        return { orderShops: [] };
      }

      const where = requestedIds.length > 0
        ? { id: { $in: requestedIds }, customerEmail: normalizedEmail }
        : { customerEmail: normalizedEmail };

      const matchedOrders = await entityManager.getRepository(OrderEntity).find(
        where,
        {
          populate: ['shop'],
          orderBy: { createdAt: 'desc' },
        },
      );

      orders = normalizedZip
        ? matchedOrders.filter((order) => {
          const zip = order.shippingAddress?.['zip'];
          return typeof zip === 'string' && zip.trim().toLowerCase() === normalizedZip;
        })
        : matchedOrders;
    }

    const orderItems = orders.length > 0
      ? await entityManager.getRepository(OrderItemEntity).find(
        { order: { $in: orders.map((order) => order.id) } },
        { populate: ['product', 'product.shop', 'inventory'] },
      )
      : [];

    const itemsByOrderId = new Map<string, OrderItemEntity[]>();

    for (const item of orderItems) {
      const existing = itemsByOrderId.get(item.order.id) ?? [];
      existing.push(item);
      itemsByOrderId.set(item.order.id, existing);
    }

    const fulfillmentViews = await this.orderFulfillmentViewPort.load(
      entityManager,
      orders.map((order) => order.id),
      { canceledOrderIds: canceledFulfillmentOrderIds(orders) },
    );

    return {
      orderShops: orders.map((order) => ({
        id: order.id,
        publicId: order.publicId,
        orderNumber: getRequiredOrderNumber(order),
        shopId: order.shop.id,
        shopPublicId: order.shop.publicId,
        shopName: order.shop.shopName,
        shopSlug: order.shop.slug,
        currency: order.currency,
        paymentType: order.paymentType,
        status: order.status,
        products: (itemsByOrderId.get(order.id) ?? []).map((item) => ({
          id: item.id,
          productId: item.product.id,
          productPublicId: item.product.publicId,
          slug: item.product.slug,
          shopSlug: item.product.shop.slug,
          title: item.title,
          imageUrl: item.imageUrl,
          quantity: item.quantity,
          amountMinor: getOrderItemAmountMinor(item, order.currency),
          originalAmountMinor: getOrderItemOriginalAmountMinor(item),
          promoDiscountMinor: item.promoDiscountMinor ?? 0,
          currency: order.currency,
          selectedOptions: item.selectedOptions ?? [],

        })),
        promoCodes: order.promoCodes,
        fulfillment: buildOrderFulfillmentSummary(order, fulfillmentViews.get(order.id)),
        canceledAt: order.canceledAt,
        cancelReason: order.cancelReason,
        customerSupportNote: order.customerSupportNote,
        cancelRequestedAt: order.cancelRequestedAt,
        refundedAt: order.refundedAt,
        paymentDetails: order.paymentDetails,
        subtotal: getOrderSubtotalMajor(order),
        subtotalMinor: getOrderSubtotalMinor(order),
        totalShippingFee: getOrderShippingMajor(order),
        shippingMinor: getOrderShippingMinor(order),
        totalDiscount: getOrderDiscountMajor(order),
        discountMinor: getOrderDiscountMinor(order),
        saleDiscountMinor: order.saleDiscountMinor,
        total: getOrderTotalMajor(order),
        totalMinor: getOrderTotalMinor(order),
        shippingQuote: parsePersistedOrderShippingSnapshot(order.shippingQuoteSnapshot),
        note: order.note,
        createdAt: order.createdAt,
      })),
    };
  }
}
