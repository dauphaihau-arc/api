import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { ProductInventoryEntity } from '../../../../product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import {
  CheckoutInventoryQueryRepository,
  type CheckoutInventoryQueryContext,
} from '../../../app/ports/checkout-inventory-query.repository';

@Injectable()
export class MikroOrmCheckoutInventoryQueryRepository
implements CheckoutInventoryQueryRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findByIds(
    inventoryIds: string[],
    context?: CheckoutInventoryQueryContext,
  ): Promise<Map<string, ProductInventoryEntity>> {
    if (inventoryIds.length === 0) {
      return new Map();
    }

    const inventories = await this.getEntityManager(context)
      .getRepository(ProductInventoryEntity)
      .find(
        { id: { $in: inventoryIds } },
        { orderBy: { id: 'asc' } },
      );

    return new Map(inventories.map((inventory) => [inventory.id, inventory]));
  }

  private getEntityManager(context?: CheckoutInventoryQueryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
