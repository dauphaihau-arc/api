import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import type { RequestOrderCancelDto } from '../../../api/rest/dto/request-order-cancel.dto';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import {
  BuyerOrderCancelNotAllowedError,
  BuyerShippedOrderCancelNotAllowedError,
  OrderNotFoundError,
} from '../../errors/order-app.error';
import { OrderCancellationService } from '../../order-cancellation.service';
import type { MyOrderDetail } from '../../order.types';

@Injectable()
export class RequestOrderCancelUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly orderCancellationService: OrderCancellationService
  ) {}

  async execute(
    actor: AuthenticatedUser,
    orderId: string,
    input: RequestOrderCancelDto
  ): Promise<MyOrderDetail> {
    const entityManager = this.entityManager.fork();

    return entityManager.transactional(async (transactionalEntityManager) => {
      const order = await transactionalEntityManager.getRepository(OrderEntity).findOne(
        { id: orderId, user: actor.userId },
        { populate: ['shop'] }
      );

      if (!order) {
        throw new OrderNotFoundError();
      }

      if (![OrderStatus.PENDING, OrderStatus.PAID].includes(order.status)) {
        throw new BuyerOrderCancelNotAllowedError();
      }

      if (order.shippingStatus !== OrderShippingStatus.PRE_TRANSIT) {
        throw new BuyerShippedOrderCancelNotAllowedError();
      }

      const now = new Date();
      order.cancelRequestedAt = now;
      await this.orderCancellationService.cancelOrder(transactionalEntityManager, order, {
        canceledAt: now,
        cancelReason: input.cancelReason,
        source: 'buyer',
      });

      await transactionalEntityManager.flush();

      const items = await transactionalEntityManager.getRepository(OrderItemEntity).find(
        { order: order.id },
        { populate: ['order', 'product', 'product.shop', 'inventory'] }
      );

      return {
        id: order.id,
        shopId: order.shop.id,
        shopName: order.shop.shopName,
        shopSlug: order.shop.slug,
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
        customerSupportNote: order.customerSupportNote,
        cancelRequestedAt: order.cancelRequestedAt,
        subtotal: Number(order.subtotal),
        totalShippingFee: Number(order.totalShippingFee),
        totalDiscount: Number(order.totalDiscount),
        total: Number(order.total),
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
    });
  }
}
