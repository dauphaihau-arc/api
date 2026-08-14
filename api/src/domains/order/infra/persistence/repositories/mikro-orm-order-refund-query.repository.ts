import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { OrderRefundQueryRepository } from '../../../app/ports/order-refund-query.repository';
import type { OrderRepositoryContext } from '../../../app/ports/order-repository-context';
import { OrderEntity } from '../entities/order.entity';

@Injectable()
export class MikroOrmOrderRefundQueryRepository
implements OrderRefundQueryRepository {
  constructor(private readonly entityManager: EntityManager) {}

  findById(
    orderId: string,
    context?: OrderRepositoryContext,
  ): Promise<OrderEntity | null> {
    return this.getEntityManager(context)
      .getRepository(OrderEntity)
      .findOne({ id: orderId });
  }

  findByIdWithShopOwner(
    orderId: string,
    context?: OrderRepositoryContext,
  ): Promise<OrderEntity | null> {
    return this.getEntityManager(context)
      .getRepository(OrderEntity)
      .findOne({ id: orderId }, { populate: ['shop.ownerUser'] });
  }

  private getEntityManager(context?: OrderRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
