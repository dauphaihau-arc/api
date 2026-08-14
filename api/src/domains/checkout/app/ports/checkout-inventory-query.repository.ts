import type { EntityManager } from '@mikro-orm/postgresql';
import type { ProductInventoryEntity } from '../../../product/infra/persistence/mikro-orm/entities/product-inventory.entity';

export interface CheckoutInventoryQueryContext {
  entityManager?: EntityManager;
}

export abstract class CheckoutInventoryQueryRepository {
  abstract findByIds(
    inventoryIds: string[],
    context?: CheckoutInventoryQueryContext
  ): Promise<Map<string, ProductInventoryEntity>>;
}
