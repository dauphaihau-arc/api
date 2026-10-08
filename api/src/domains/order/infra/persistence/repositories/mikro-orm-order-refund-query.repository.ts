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

  async findByPublicId(
    publicId: string,
    context?: OrderRepositoryContext,
  ): Promise<string | null> {
    const order = await this.getEntityManager(context)
      .getRepository(OrderEntity)
      .findOne(
        { publicId },
        { fields: ['id'] },
      );

    return order?.id ?? null;
  }

  async findIdsByPublicIds(
    publicIds: readonly string[],
    context?: OrderRepositoryContext,
  ): Promise<ReadonlyMap<string, string>> {
    if (publicIds.length === 0) {
      return new Map();
    }

    const orders = await this.getEntityManager(context)
      .getRepository(OrderEntity)
      .find(
        { publicId: { $in: [...new Set(publicIds)] } },
        { fields: ['id', 'publicId'] },
      );

    return new Map(orders.map(order => [order.publicId, order.id]));
  }

  private getEntityManager(context?: OrderRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
