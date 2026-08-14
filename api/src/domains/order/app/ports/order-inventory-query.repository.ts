import type { ProductInventoryEntity } from '../../../product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import type { OrderRepositoryContext } from './order-repository-context';

export abstract class OrderInventoryQueryRepository {
  abstract findByIds(
    inventoryIds: string[],
    context?: OrderRepositoryContext
  ): Promise<Map<string, ProductInventoryEntity>>;
}
