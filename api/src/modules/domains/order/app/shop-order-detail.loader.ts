import { EntityManager } from '@mikro-orm/postgresql';
import { OrderEventEntity } from '../infra/persistence/entities/order-event.entity';
import { OrderEntity } from '../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../infra/persistence/entities/order-item.entity';
import { toShopOrderDetail } from './shop-order-read-model';
import type { ShopOrderDetail } from './order.types';

export async function buildShopOrderDetail(
  entityManager: EntityManager,
  order: OrderEntity
): Promise<ShopOrderDetail> {
  const [items, timelineEvents] = await Promise.all([
    entityManager.getRepository(OrderItemEntity).find(
      { order: order.id },
      { populate: ['product', 'product.shop', 'product.images', 'product.images.variants', 'inventory'] }
    ),
    entityManager.getRepository(OrderEventEntity).find(
      { order: order.id },
      { orderBy: { occurredAt: 'asc', id: 'asc' } }
    ),
  ]);

  return toShopOrderDetail(order, items, timelineEvents.map((event) => ({
    id: event.id,
    type: event.type,
    occurredAt: event.occurredAt,
    actorType: event.actorType,
    actorId: event.actorId,
    source: event.source,
    payload: event.payload,
  })));
}
