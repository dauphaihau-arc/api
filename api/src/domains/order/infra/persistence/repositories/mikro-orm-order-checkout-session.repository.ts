import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { OrderCheckoutSessionRepository } from '../../../app/ports/order-checkout-session.repository';
import type { OrderRepositoryContext } from '../../../app/ports/order-repository-context';
import { OrderEntity } from '../entities/order.entity';

@Injectable()
export class MikroOrmOrderCheckoutSessionRepository
implements OrderCheckoutSessionRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findOrdersByCheckoutSession(
    sessionId: string,
    context?: OrderRepositoryContext,
  ): Promise<OrderEntity[]> {
    const entityManager = this.getEntityManager(context);
    const rows = await entityManager.getConnection().execute<{ id: string }[]>(
      `select id
       from orders
       where payment_details ->> 'checkout_session_id' = ?`,
      [sessionId],
    );
    const orderIds = rows.map((row) => row.id);

    if (orderIds.length === 0) {
      return [];
    }

    return entityManager.getRepository(OrderEntity).find(
      { id: { $in: orderIds } },
      { populate: ['shop'], orderBy: { createdAt: 'asc' } },
    );
  }

  private getEntityManager(context?: OrderRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
