import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  type ClearCheckoutCartInput,
  OrderCartCleanupRepository,
} from '../../../app/ports/order-cart-cleanup.repository';
import type { OrderRepositoryContext } from '../../../app/ports/order-repository-context';

@Injectable()
export class MikroOrmOrderCartCleanupRepository
implements OrderCartCleanupRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async clearCheckoutCart(
    input: ClearCheckoutCartInput,
    context?: OrderRepositoryContext,
  ): Promise<void> {
    const entityManager = this.getEntityManager(context);

    if (input.isTempCart) {
      await entityManager.getConnection().execute(
        'delete from carts where id = ?',
        [input.cartId],
      );
      return;
    }

    if (input.inventoryIds && input.inventoryIds.length > 0) {
      const placeholders = input.inventoryIds.map(() => '?').join(', ');
      await entityManager.getConnection().execute(
        `delete from cart_items where cart_id = ? and product_inventory_id in (${placeholders})`,
        [input.cartId, ...input.inventoryIds],
      );
    }
    else {
      await entityManager.getConnection().execute(
        'delete from cart_items where cart_id = ? and is_select_order = true',
        [input.cartId],
      );
    }

    await entityManager.getConnection().execute(
      'delete from carts where id = ? and not exists (select 1 from cart_items where cart_items.cart_id = carts.id)',
      [input.cartId],
    );
  }

  private getEntityManager(context?: OrderRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
