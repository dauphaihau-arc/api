import { EntityManager, LockMode } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { OrderItemEntity } from '~/domains/order/infra/persistence/entities/order-item.entity';
import { OrderEntity } from '~/domains/order/infra/persistence/entities/order.entity';
import { buildScopedOrderIdentifierWhere } from '~/domains/order/app/order-identifier';
import { getRequiredOrderNumber } from '~/domains/order/app/order-number';
import {
  OrderFulfillmentContextPort,
  type OrderFulfillmentContext,
} from '../../../app/ports/order-fulfillment-context.port';

/**
 * Narrow, deliberate cross-domain exception: Fulfillment needs a shop-scoped
 * snapshot of an Order and its item quantities, but the boundary rules forbid
 * leaking foreign ORM entities into Fulfillment's app layer. The dependency is
 * confined to this single adapter, which returns plain data behind
 * OrderFulfillmentContextPort, so no Order entity reaches Fulfillment's
 * application or domain code.
 */
@Injectable()
export class MikroOrmOrderFulfillmentContextAdapter
implements OrderFulfillmentContextPort {
  constructor(private readonly entityManager: EntityManager) {}

  async findForFulfillment(
    shopId: string,
    orderIdentifier: string,
    options: { entityManager?: EntityManager; lock?: boolean } = {},
  ): Promise<OrderFulfillmentContext | null> {
    const entityManager = options.entityManager ?? this.entityManager.fork();
    const order = await entityManager.getRepository(OrderEntity).findOne(
      buildScopedOrderIdentifierWhere(orderIdentifier, { shop: shopId }),
      {
        populate: ['user'],
        ...(options.lock ? { lockMode: LockMode.PESSIMISTIC_WRITE } : {}),
      },
    );

    if (!order) {
      return null;
    }

    const items = await entityManager.getRepository(OrderItemEntity).find(
      { order: order.id },
    );

    return {
      id: order.id,
      orderNumber: getRequiredOrderNumber(order),
      shopId: order.shop.id,
      status: order.status,
      customerUserId: order.user?.id,
      fulfillmentStatus: order.fulfillmentStatus,
      originCountries: order.shippingOriginCountries,
      items: items.map((item) => ({
        orderItemId: item.id,
        quantity: item.quantity,
      })),
      legacyShipping: {
        status: order.shippingStatus,
        updatedAt: order.deliveredAt ?? order.shippedAt ?? order.createdAt,
        toCountry: order.shippingToCountry,
        fromCountries: order.shippingOriginCountries,
        estimatedDelivery: order.shippingEstimatedDelivery,
        trackingNumber: order.trackingNumber,
        carrier: order.shippingCarrier,
        note: order.shipmentNote,
        shippedAt: order.shippedAt,
        deliveredAt: order.deliveredAt,
      },
    };
  }
}
