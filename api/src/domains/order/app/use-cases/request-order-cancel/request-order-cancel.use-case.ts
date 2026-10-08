import { EntityManager, LockMode } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { PRODUCT_INVENTORY_UPDATED_SSE_EVENT } from '~/domains/product/app/events/product-inventory-sse.event';
import { dispatchCatalogProductProjections } from '~/domains/product/app/catalog-product-projection-dispatch';
import { NotifyUserUseCase } from '~/domains/notification/app/use-cases/notify-user/notify-user.use-case';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { OrderFulfillmentViewPort } from '../../../../fulfillment/app/ports/order-fulfillment-view.port';
import { FulfillmentService } from '../../../../fulfillment/app/services/fulfillment.service';
import { ORDER_UPDATED_SSE_EVENT } from '../../events/order-sse.event';
import { buildOrderFulfillmentSummary, canceledFulfillmentOrderIds } from '../../order-fulfillment';
import type { RequestOrderCancelDto } from '../../../api/rest/dto/request-order-cancel.dto';
import { OrderEventActorType } from '../../../domain/enums/order-event-actor-type.enum';
import { OrderEventType } from '../../../domain/enums/order-event-type.enum';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import {
  BuyerOrderCancelNotAllowedError,
  BuyerShippedOrderCancelNotAllowedError,
  OrderNotFoundError,
} from '../../errors/order-app.error';
import { OrderCancellationService } from '../../services/order-cancellation.service';
import { buildScopedOrderIdentifierWhere } from '../../order-identifier';
import { getRequiredOrderNumber } from '../../order-number';
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
import { dispatchBestSellerRankingRefresh } from '../../best-seller-ranking-refresh';
import { OrderEventsService } from '../../services/order-events.service';

@Injectable()
export class RequestOrderCancelUseCase {
  private readonly logger = new Logger(RequestOrderCancelUseCase.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly orderCancellationService: OrderCancellationService,
    private readonly fulfillmentService: FulfillmentService,
    private readonly jobDispatcher: JobDispatcher,
    private readonly notifyUserUseCase: NotifyUserUseCase,
    private readonly eventEmitter: EventEmitter2,
    private readonly orderEventsService: OrderEventsService,
    private readonly orderFulfillmentViewPort: OrderFulfillmentViewPort,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    orderId: string,
    input: RequestOrderCancelDto,
  ): Promise<MyOrderDetail> {
    const entityManager = this.entityManager.fork();

    const result = await entityManager.transactional(async (transactionalEntityManager) => {
      const order = await transactionalEntityManager.getRepository(OrderEntity).findOne(
        buildScopedOrderIdentifierWhere(orderId, { user: actor.userId }),
        { populate: ['shop.ownerUser'], lockMode: LockMode.PESSIMISTIC_WRITE },
      );

      if (!order) {
        throw new OrderNotFoundError();
      }

      if (![OrderStatus.PENDING, OrderStatus.PAID].includes(order.status)) {
        throw new BuyerOrderCancelNotAllowedError();
      }

      const dispatchState = await this.fulfillmentService.getDispatchState(
        transactionalEntityManager,
        order.id,
      );
      const legacyDispatched = !dispatchState.hasGroups
        && order.shippingStatus !== OrderShippingStatus.PRE_TRANSIT;

      if (dispatchState.hasDispatched || legacyDispatched) {
        throw new BuyerShippedOrderCancelNotAllowedError();
      }

      const now = new Date();
      const previousStatus = order.status;
      order.cancelRequestedAt = now;
      await this.orderEventsService.record(transactionalEntityManager, {
        order,
        type: OrderEventType.CANCEL_REQUESTED,
        actorType: OrderEventActorType.BUYER,
        actorId: actor.userId,
        source: 'buyer_order_cancel',
        occurredAt: now,
        payload: {
          reason: input.cancelReason,
        },
      });
      const { refundRequested, inventoryEvents } = await this.orderCancellationService.cancelOrder(transactionalEntityManager, order, {
        canceledAt: now,
        cancelReason: input.cancelReason,
        source: 'buyer',
      });
      await this.orderEventsService.record(transactionalEntityManager, {
        order,
        type: OrderEventType.ORDER_STATUS_CHANGED,
        actorType: OrderEventActorType.BUYER,
        actorId: actor.userId,
        source: 'buyer_order_cancel',
        occurredAt: now,
        payload: {
          from: previousStatus,
          to: order.status,
          reason: input.cancelReason,
        },
      });

      await transactionalEntityManager.flush();

      const items = await transactionalEntityManager.getRepository(OrderItemEntity).find(
        { order: order.id },
        { populate: ['product', 'product.shop', 'inventory'] },
      );
      const fulfillmentView = (await this.orderFulfillmentViewPort.load(
        transactionalEntityManager,
        [order.id],
        { canceledOrderIds: canceledFulfillmentOrderIds([order]) },
      )).get(order.id);

      return {
        refundRequested,
        inventoryEvents,
        id: order.id,
        publicId: order.publicId,
        orderNumber: getRequiredOrderNumber(order),
        shopId: order.shop.id,
        shopPublicId: order.shop.publicId,
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
        fulfillment: buildOrderFulfillmentSummary(order, fulfillmentView),
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
      orderId: result.publicId,
      changed: ['status', 'fulfillment'],
      status: result.status,
    });

    for (const inventoryEvent of result.inventoryEvents) {
      this.eventEmitter.emit(PRODUCT_INVENTORY_UPDATED_SSE_EVENT, inventoryEvent);
    }

    try {
      await dispatchCatalogProductProjections(
        this.jobDispatcher,
        result.inventoryEvents.map((event) => event.productId),
      );
    }
    catch (error) {
      // Catalog projection is a derived read model: a failed enqueue must not fail
      // the committed cancellation, which would invite a confusing retry.
      this.logger.error(
        `Failed to schedule catalog projections for canceled order ${result.id}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    if (result.refundRequested) {
      try {
        await this.jobDispatcher.dispatch('order.process-refund', { orderId: result.id });
      }
      catch (error) {
        this.logger.error(
          `Failed to schedule refund for canceled order ${result.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    try {
      await dispatchBestSellerRankingRefresh(this.jobDispatcher);
    }
    catch (error) {
      this.logger.error(
        `Failed to schedule best-seller ranking refresh for canceled order ${result.id}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    try {
      await this.jobDispatcher.dispatch('order.send-seller-order-update-email', {
        orderId: result.id,
        eventType: 'canceled',
      });
    }
    catch (error) {
      this.logger.error(
        `Failed to schedule seller cancellation notification for order ${result.id}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    if (result.sellerUserId) {
      await this.notifyUserUseCase.execute(
        buildSellerOrderCancelRequestedNotification(
          result.sellerUserId,
          result.publicId,
          result.orderNumber,
          result.shopPublicId,
        ),
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
