import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { LiveProductInventoryStockRepository } from '../../../../app/ports/live-product-inventory-stock.repository';
import { ProductInventoryEntity } from '../entities/product-inventory.entity';

@Injectable()
export class MikroOrmLiveProductInventoryStockRepository
implements LiveProductInventoryStockRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findStockByInventoryIds(inventoryIds: string[]): Promise<Map<string, number>> {
    if (inventoryIds.length === 0) {
      return new Map();
    }

    const inventories = await this.entityManager.fork()
      .getRepository(ProductInventoryEntity)
      .find(
        { id: { $in: inventoryIds } },
        { orderBy: { id: 'asc' } },
      );

    return new Map(
      inventories.map((inventory) => [inventory.id, inventory.stock] as const),
    );
  }
}
