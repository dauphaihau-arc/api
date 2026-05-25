import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { JobDispatcher } from '~/modules/shared/queue/app/ports/job-dispatcher';
import type { UpdateShopOrderStatusDto } from '../../../api/rest/dto/update-shop-order-status.dto';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import {
  OrderNotFoundError,
  SellerOrderCancelNotAllowedError,
  SellerOrderStatusUpdateNotAllowedError,
  SellerShippedOrderCancelNotAllowedError,
} from '../../errors/order-app.error';
import { OrderCancellationService } from '../../order-cancellation.service';
import { toShopOrderDetail } from '../../shop-order-read-model';
import type { ShopOrderDetail } from '../../order.types';

@Injectable()
export class UpdateShopOrderStatusUseCase {
  private readonly logger = new Logger(UpdateShopOrderStatusUseCase.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly orderCancellationService: OrderCancellationService,
    private readonly jobDispatcher: JobDispatcher
  ) {}

  async execute(
    shopId: string,
    orderId: string,
    input: UpdateShopOrderStatusDto
  ): Promise<ShopOrderDetail> {
    const entityManager = this.entityManager.fork();
    const result = await entityManager.transactional(async (transactionalEntityManager) => {
      const order = await transactionalEntityManager.getRepository(OrderEntity).findOne(
        { id: orderId, shop: shopId },
        { populate: ['shop'] }
      );

      if (!order) {
        throw new OrderNotFoundError();
      }

      if (input.status !== OrderStatus.CANCELED) {
        throw new SellerOrderStatusUpdateNotAllowedError();
      }

      if (order.status === OrderStatus.CANCELED) {
        return {
          refundRequested: false,
          detail: await this.buildDetail(transactionalEntityManager, order),
        };
      }

      if (![OrderStatus.PENDING, OrderStatus.PAID].includes(order.status)) {
        throw new SellerOrderCancelNotAllowedError();
      }

      if (order.shippingStatus !== OrderShippingStatus.PRE_TRANSIT) {
        throw new SellerShippedOrderCancelNotAllowedError();
      }

      const { refundRequested } = await this.orderCancellationService.cancelOrder(transactionalEntityManager, order, {
        canceledAt: new Date(),
        cancelReason: input.cancelReason,
        source: 'seller',
      });

      await transactionalEntityManager.flush();

      return {
        refundRequested,
        detail: await this.buildDetail(transactionalEntityManager, order),
      };
    });

    if (result.refundRequested) {
      try {
        await this.jobDispatcher.dispatch('order.process-refund', { orderId });
      }
      catch (error) {
        this.logger.error(
          `Failed to schedule refund for canceled shop order ${orderId}`,
          error instanceof Error ? error.stack : undefined
        );
      }
    }

    return result.detail;
  }

  private async buildDetail(
    entityManager: EntityManager,
    order: OrderEntity
  ): Promise<ShopOrderDetail> {
    const items = await entityManager.getRepository(OrderItemEntity).find(
      { order: order.id },
      { populate: ['order', 'product', 'product.shop', 'inventory'] }
    );

    return toShopOrderDetail(order, items);
  }
}
