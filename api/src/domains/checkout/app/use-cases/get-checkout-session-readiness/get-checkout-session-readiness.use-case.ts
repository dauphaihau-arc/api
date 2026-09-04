import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { OrderEntity } from '~/domains/order/infra/persistence/entities/order.entity';
import { getRequiredOrderNumber } from '~/domains/order/app/order-number';
import type { CreateOrderResult } from '~/domains/order/app/order.types';

@Injectable()
export class GetCheckoutSessionReadinessUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(actor: AuthenticatedUser, orderIds: string[]): Promise<CreateOrderResult> {
    if (orderIds.length === 0) {
      throw new BadRequestException('order_ids is required');
    }

    const uniqueOrderIds = [...new Set(orderIds)];
    const entityManager = this.entityManager.fork();

    const orders = await entityManager.find(
      OrderEntity,
      {
        id: { $in: uniqueOrderIds },
        user: actor.userId,
      },
      { populate: ['shop'] },
    );

    if (orders.length !== uniqueOrderIds.length) {
      throw new NotFoundException('Checkout orders not found');
    }

    const checkoutSessionUrl = orders
      .map((order) => order.paymentDetails?.checkout_session_url)
      .find((value): value is string => typeof value === 'string' && value.length > 0);

    const checkoutSessionId = orders
      .map((order) => order.paymentDetails?.checkout_session_id)
      .find((value): value is string => typeof value === 'string' && value.length > 0);

    return {
      checkoutPending: !checkoutSessionUrl,
      checkoutSessionId,
      checkoutSessionUrl,
      orderShops: orders.map((order) => ({
        id: order.id,
        orderNumber: getRequiredOrderNumber(order),
        shopId: order.shop.id,
        shopName: order.shop.shopName,
        shopSlug: order.shop.slug,
      })),
    };
  }
}
