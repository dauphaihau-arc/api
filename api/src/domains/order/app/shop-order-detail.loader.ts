import type { EntityManager } from '@mikro-orm/postgresql';
import type { OrderFulfillmentViewPort } from '../../fulfillment/app/ports/order-fulfillment-view.port';
import { OrderEventEntity } from '../infra/persistence/entities/order-event.entity';
import type { OrderEntity } from '../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../infra/persistence/entities/order-item.entity';
import { canceledFulfillmentOrderIds } from './order-fulfillment';
import { toShopOrderDetail } from './shop-order-read-model';
import type { ShopOrderDetail } from './order.types';

export async function buildShopOrderDetail(
  entityManager: EntityManager,
  order: OrderEntity,
  orderFulfillmentViewPort: OrderFulfillmentViewPort,
): Promise<ShopOrderDetail> {
  const [items, timelineEvents, fulfillmentViews] = await Promise.all([
    entityManager.getRepository(OrderItemEntity).find(
      { order: order.id },
      { populate: ['product', 'product.shop', 'product.images', 'product.images.variants', 'inventory'] },
    ),
    entityManager.getRepository(OrderEventEntity).find(
      { order: order.id },
      { orderBy: { occurredAt: 'asc', id: 'asc' } },
    ),
    orderFulfillmentViewPort.load(entityManager, [order.id], {
      canceledOrderIds: canceledFulfillmentOrderIds([order]),
    }),
  ]);

  return toShopOrderDetail(
    order,
    items,
    timelineEvents.map((event) => ({
      id: event.id,
      type: event.type,
      occurredAt: event.occurredAt,
      actorType: event.actorType,
      actorId: event.actorId,
      source: event.source,
      payload: event.payload,
    })),
    fulfillmentViews.get(order.id),
  );
}
