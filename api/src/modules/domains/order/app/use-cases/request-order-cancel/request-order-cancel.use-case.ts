import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { PRODUCT_INVENTORY_UPDATED_SSE_EVENT } from '~/modules/domains/product/app/events/product-inventory-sse.event';
import { NotifyUserUseCase } from '~/modules/shared/notification/app/use-cases/notify-user/notify-user.use-case';
import { JobDispatcher } from '~/modules/shared/queue/app/ports/job-dispatcher';
import { ORDER_UPDATED_SSE_EVENT } from '../../events/order-sse.event';
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
import {
  buildSellerOrderCancelRequestedNotification,
  getSellerOrderNotificationRecipientId,
} from '../../seller-order-notification';

@Injectable()
export class RequestOrderCancelUseCase {
  private readonly logger = new Logger(RequestOrderCancelUseCase.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly orderCancellationService: OrderCancellationService,
    private readonly jobDispatcher: JobDispatcher,
    private readonly notifyUserUseCase: NotifyUserUseCase,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async execute(
    actor: AuthenticatedUser,
    orderId: string,
    input: RequestOrderCancelDto
  ): Promise<MyOrderDetail> {
    const entityManager = this.entityManager.fork();

    const result = await entityManager.transactional(async (transactionalEntityManager) => {
      const order = await transactionalEntityManager.getRepository(OrderEntity).findOne(
        { id: orderId, user: actor.userId },
        { populate: ['shop.ownerUser'] }
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
      const { refundRequested, inventoryEvents } = await this.orderCancellationService.cancelOrder(transactionalEntityManager, order, {
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
        refundRequested,
        inventoryEvents,
        id: order.id,
        shopId: order.shop.id,
        sellerUserId: getSellerOrderNotificationRecipientId(order),
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

    this.eventEmitter.emit(ORDER_UPDATED_SSE_EVENT, {
      userId: actor.userId,
      orderId,
      changed: ['status'],
      status: result.status,
      shippingStatus: result.shippingStatus,
    });

    for (const inventoryEvent of result.inventoryEvents) {
      this.eventEmitter.emit(PRODUCT_INVENTORY_UPDATED_SSE_EVENT, inventoryEvent);
    }

    if (result.refundRequested) {
      try {
        await this.jobDispatcher.dispatch('order.process-refund', { orderId });
      }
      catch (error) {
        this.logger.error(
          `Failed to schedule refund for canceled order ${orderId}`,
          error instanceof Error ? error.stack : undefined
        );
      }
    }
    try {
      await this.jobDispatcher.dispatch('order.send-seller-order-update-email', {
        orderId,
        eventType: 'canceled',
      });
    }
    catch (error) {
      this.logger.error(
        `Failed to schedule seller cancellation notification for order ${orderId}`,
        error instanceof Error ? error.stack : undefined
      );
    }

    if (result.sellerUserId) {
      await this.notifyUserUseCase.execute(
        buildSellerOrderCancelRequestedNotification(
          result.sellerUserId,
          orderId,
          result.shopId
        )
      );
    }

    const {
      refundRequested: _refundRequested,
      sellerUserId: _sellerUserId,
      ...detail
    } = result;
    return detail;
  }
}
