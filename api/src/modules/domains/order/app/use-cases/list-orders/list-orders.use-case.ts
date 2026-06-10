import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import type { ListMyOrdersQueryDto } from '../../../api/rest/dto/list-my-orders.query.dto';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
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
  getOrderTotalMajor
} from '../../order-money';
import { getRequiredOrderNumber } from '../../order-number';
import type { OrderListResult } from '../../order.types';

@Injectable()
export class ListOrdersUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(
    actor: AuthenticatedUser,
    query: ListMyOrdersQueryDto
  ): Promise<OrderListResult> {
    const entityManager = this.entityManager.fork();

    const orders = await entityManager.getRepository(OrderEntity).find(
      { user: actor.userId },
      {
        populate: ['shop'],
        orderBy: { createdAt: 'desc' },
      }
    );

    const orderItems = orders.length > 0
      ? await entityManager.getRepository(OrderItemEntity).find(
        { order: { $in: orders.map((order) => order.id) } },
        { populate: ['product', 'product.shop', 'inventory'] }
      )
      : [];

    const itemsByOrderId = new Map<string, OrderItemEntity[]>();

    for (const item of orderItems) {
      const existing = itemsByOrderId.get(item.order.id) ?? [];
      existing.push(item);
      itemsByOrderId.set(item.order.id, existing);
    }

    const normalizedSearch = query.search?.trim().toLowerCase();

    const filteredOrders = orders.filter((order) => {
      const orderNumber = getRequiredOrderNumber(order);

      if (query.state && !matchesCustomerState(order, query.state)) {
        return false;
      }

      if (query.status && order.status !== query.status) {
        return false;
      }

      if (query.shippingStatus && order.shippingStatus !== query.shippingStatus) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      if (order.id.toLowerCase().includes(normalizedSearch)) {
        return true;
      }

      if (orderNumber.toLowerCase().includes(normalizedSearch)) {
        return true;
      }

      if (
        order.shop.shopName.toLowerCase().includes(normalizedSearch)
        || order.shop.slug.toLowerCase().includes(normalizedSearch)
      ) {
        return true;
      }

      return (itemsByOrderId.get(order.id) ?? []).some((item) =>
        item.title.toLowerCase().includes(normalizedSearch)
      );
    });

    return {
      orderShops: filteredOrders.map((order) => ({
        id: order.id,
        orderNumber: getRequiredOrderNumber(order),
        shopId: order.shop.id,
        shopName: order.shop.shopName,
        shopSlug: order.shop.slug,
        currency: order.currency,
        paymentType: order.paymentType,
        status: order.status,
        products: (itemsByOrderId.get(order.id) ?? []).map((item) => ({
          id: item.id,
          productId: item.product.id,
          slug: item.product.slug,
          shopSlug: item.product.shop.slug,
          title: item.title,
          imageUrl: item.imageUrl,
          quantity: item.quantity,
          amountMinor: getOrderItemAmountMinor(item, order.currency),
          originalAmountMinor: getOrderItemOriginalAmountMinor(item),
          currency: order.currency,
          variantName: item.variantName,
          variantGroupName: item.variantGroupName,
          variantSubGroupName: item.variantSubGroupName,
          percentCouponPercent: item.percentCouponPercent ?? null,
        })),
        promoCodes: order.promoCodes,
        shippingStatus: order.shippingStatus,
        shippingUpdatedAt: order.updatedAt,
        shippingToCountry: order.shippingToCountry,
        shippingFromCountries: order.shippingOriginCountries,
        shippingEstimatedDelivery: order.shippingEstimatedDelivery,
        trackingNumber: order.trackingNumber,
        shippingCarrier: order.shippingCarrier,
        shipmentNote: order.shipmentNote,
        shippedAt: order.shippedAt,
        deliveredAt: order.deliveredAt,
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
        total: getOrderTotalMajor(order),
        totalMinor: getOrderTotalMinor(order),
        note: order.note,
        createdAt: order.createdAt,
      })),
    };
  }
}

function matchesCustomerState(
  order: Pick<OrderEntity, 'status' | 'shippingStatus'>,
  state: NonNullable<ListMyOrdersQueryDto['state']>
): boolean {
  switch (state) {
    case 'awaiting_payment':
      return [
        OrderStatus.PENDING,
        OrderStatus.CHECKOUT_PENDING,
        OrderStatus.AWAITING_PAYMENT,
      ].includes(order.status);
    case 'processing':
      return order.status === OrderStatus.PAID
        && order.shippingStatus === OrderShippingStatus.PRE_TRANSIT;
    case 'shipped':
      return [OrderShippingStatus.IN_TRANSIT, OrderShippingStatus.SHIPPED]
        .includes(order.shippingStatus);
    case 'delivered':
      return order.shippingStatus === OrderShippingStatus.DELIVERED;
    case 'canceled':
      return order.status === OrderStatus.CANCELED;
    case 'refunded':
      return order.status === OrderStatus.REFUNDED;
    default:
      return true;
  }
}
