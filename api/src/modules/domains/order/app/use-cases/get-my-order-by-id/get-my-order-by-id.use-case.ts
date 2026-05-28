import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import { OrderNotFoundError } from '../../errors/order-app.error';
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
} from '../../order-money';
import type { MyOrderDetail } from '../../order.types';

@Injectable()
export class GetMyOrderByIdUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(actor: AuthenticatedUser, orderId: string): Promise<MyOrderDetail> {
    const entityManager = this.entityManager.fork();
    const order = await entityManager.getRepository(OrderEntity).findOne(
      { id: orderId, user: actor.userId },
      { populate: ['shop'] }
    );

    if (!order) {
      throw new OrderNotFoundError();
    }

    const items = await entityManager.getRepository(OrderItemEntity).find(
      { order: order.id },
      { populate: ['order', 'product', 'product.shop', 'inventory'] }
    );

    return {
      id: order.id,
      shopId: order.shop.id,
      shopName: order.shop.shopName,
      shopSlug: order.shop.slug,
      currency: order.currency,
      customerEmail: order.customerEmail,
      paymentType: order.paymentType,
      status: order.status,
      products: items.map((item) => ({
        id: item.id,
        productId: item.product.id,
        slug: item.product.slug,
        shopSlug: item.product.shop.slug,
        title: item.title,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        amountMinor: getOrderItemAmountMinor(item),
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
      shippingAddress: {
        fullName: String((order.shippingAddress?.full_name ?? '')),
        address1: String((order.shippingAddress?.address1 ?? '')),
        ...(order.shippingAddress?.address2
          ? { address2: String(order.shippingAddress.address2) }
          : {}),
        city: String((order.shippingAddress?.city ?? '')),
        country: String((order.shippingAddress?.country ?? '')),
        state: String((order.shippingAddress?.state ?? '')),
        zip: String((order.shippingAddress?.zip ?? '')),
        ...(order.shippingAddress?.phone
          ? { phone: String(order.shippingAddress.phone) }
          : {}),
      },
    };
  }
}
