import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import type { OrderListResult } from '../../order.types';

@Injectable()
export class ListOrdersUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(actor: AuthenticatedUser): Promise<OrderListResult> {
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
        { populate: ['order', 'product', 'product.shop', 'inventory'] }
      )
      : [];
    const itemsByOrderId = new Map<string, OrderItemEntity[]>();

    for (const item of orderItems) {
      const existing = itemsByOrderId.get(item.order.id) ?? [];
      existing.push(item);
      itemsByOrderId.set(item.order.id, existing);
    }

    return {
      orderShops: orders.map((order) => ({
        id: order.id,
        shopId: order.shop.id,
        shopName: order.shop.shopName,
        shopSlug: order.shop.slug,
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
          price: Number(item.price),
          salePrice: item.salePrice ? Number(item.salePrice) : null,
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
        subtotal: Number(order.subtotal),
        totalShippingFee: Number(order.totalShippingFee),
        totalDiscount: Number(order.totalDiscount),
        total: Number(order.total),
        note: order.note,
        createdAt: order.createdAt,
      })),
    };
  }
}
