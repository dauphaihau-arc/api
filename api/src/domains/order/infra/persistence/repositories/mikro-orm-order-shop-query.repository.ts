import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { ShopEntity } from '../../../../shop/infra/persistence/entities/shop.entity';
import { OrderShopQueryRepository } from '../../../app/ports/order-shop-query.repository';
import type { OrderRepositoryContext } from '../../../app/ports/order-repository-context';

@Injectable()
export class MikroOrmOrderShopQueryRepository implements OrderShopQueryRepository {
  constructor(private readonly entityManager: EntityManager) {}

  findByIdWithOwner(
    shopId: string,
    context?: OrderRepositoryContext,
  ): Promise<ShopEntity | null> {
    return this.getEntityManager(context)
      .getRepository(ShopEntity)
      .findOne(
        { id: shopId },
        { populate: ['ownerUser'] },
      );
  }

  private getEntityManager(context?: OrderRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
