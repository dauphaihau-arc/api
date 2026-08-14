import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { ProductInventoryEntity } from '../../../../product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { OrderInventoryQueryRepository } from '../../../app/ports/order-inventory-query.repository';
import type { OrderRepositoryContext } from '../../../app/ports/order-repository-context';

@Injectable()
export class MikroOrmOrderInventoryQueryRepository
implements OrderInventoryQueryRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findByIds(
    inventoryIds: string[],
    context?: OrderRepositoryContext,
  ): Promise<Map<string, ProductInventoryEntity>> {
    if (inventoryIds.length === 0) {
      return new Map();
    }

    const inventories = await this.getEntityManager(context)
      .getRepository(ProductInventoryEntity)
      .find({ id: { $in: inventoryIds } });

    return new Map(inventories.map((inventory) => [inventory.id, inventory]));
  }

  private getEntityManager(context?: OrderRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
