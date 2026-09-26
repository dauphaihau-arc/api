import { FlushMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  InventoryStockPoolPort,
  type CountSellerPoolInput,
  type OpenSellerPoolInput,
  type StockPoolBalance,
} from '../../../../app/ports/inventory-stock-pool.port';
import {
  StockPoolNotFoundError,
  StockPoolVersionConflictError,
} from '../../../../app/errors/product-app.error';
import {
  DEFAULT_SELLER_STOCK_POOL_NAME,
  ProductStockPoolCustody,
  ProductStockPoolEntity,
  ProductStockPoolLifecycleState,
} from '~/domains/product/infra/persistence/mikro-orm/entities/product-stock-pool.entity';

type PoolBalanceRow = {
  stock_pool_id: string;
  on_hand_quantity: number;
  reserved_quantity: number;
  on_hand_version: number;
};

/**
 * MikroORM-backed Inventory Stock Pool authority.
 *
 * `openSellerPool` and `countSellerPool` are raw SQL on purpose: both need
 * statement-level atomicity that has no ORM equivalent — a conditional insert
 * keyed on an existence predicate (there is no unique index to infer an upsert
 * on), and an optimistic version check whose post-update balance comes back
 * from the same statement. Point reads go through the EntityManager so the
 * column list here cannot drift from `ProductStockPoolEntity`.
 */
@Injectable()
export class MikroOrmInventoryStockPoolRepository implements InventoryStockPoolPort {
  /**
   * Raw SQL is required: the insert is conditional on an existence predicate
   * over a non-unique column set, which `em.upsert` cannot infer, and both the
   * insert and the read-back must see one statement snapshot.
   *
   * Caller contract: pass the EntityManager of the transaction that created
   * `inventoryId`. Pool identity is not schema-enforced (only non-unique
   * indexes on `inventory_id` and `shop_id` exist), so two transactions opening
   * a pool for the same already-committed inventory could both insert a default
   * pool.
   */
  async openSellerPool(
    entityManager: EntityManager,
    input: OpenSellerPoolInput,
  ): Promise<{ stockPoolId: string }> {
    const rows = await entityManager.execute<Array<{ id: string }>>(
      `
        with existing as (
          select id
          from product_stock_pool
          where inventory_id = ?::uuid
            and custody = 'seller'
            and is_default = true
            and lifecycle_state <> 'removed'
          limit 1
        ),
        inserted as (
          insert into product_stock_pool (
            id, created_at, updated_at, inventory_id, shop_id, name, custody,
            is_default, lifecycle_state, on_hand_quantity, reserved_quantity,
            on_hand_version, stock
          )
          select gen_random_uuid(), now(), now(), ?::uuid, ?::uuid, ?, 'seller',
                 true, 'active', ?, 0, 1, greatest(?, 0)
          where not exists (select 1 from existing)
          returning id
        )
        select id from inserted
        union all
        select id from existing
      `,
      [
        input.inventoryId,
        input.inventoryId,
        input.shopId,
        DEFAULT_SELLER_STOCK_POOL_NAME,
        input.onHandQuantity,
        input.onHandQuantity,
      ],
    );

    const stockPoolId = rows[0]?.id;
    if (!stockPoolId) throw new StockPoolNotFoundError(input.inventoryId);

    if (input.onHandQuantity > 0) {
      await entityManager.execute(
        `
          insert into inventory_movements (
            inventory_id, stock_pool_id, movement_kind, quantity_delta,
            on_hand_before, on_hand_after, reserved_before, reserved_after,
            cause, actor_type, actor_id, command_id
          )
          values (?, ?::uuid, 'seller_count', ?, 0, ?, 0, 0,
                  'product_variant_configuration', ?, ?, ?)
          on conflict (command_id, stock_pool_id, movement_kind)
            where command_id is not null do nothing
        `,
        [
          input.inventoryId,
          stockPoolId,
          input.onHandQuantity,
          input.onHandQuantity,
          input.actorId ? 'user' : null,
          input.actorId ?? null,
          input.commandId ?? null,
        ],
      );
    }

    return { stockPoolId };
  }

  async findSellerPoolId(
    entityManager: EntityManager,
    input: { inventoryId: string },
  ): Promise<string | null> {
    // `disableIdentityMap` + `FlushMode.COMMIT`: the balance statements above are
    // raw SQL, so the pool row may already sit stale in the identity map (and
    // `ProductInventoryEntity.stockPools` can populate it), and this read must
    // neither reuse that copy nor trigger an implicit flush that
    // `entityManager.execute` did not perform.
    const pools = await entityManager.find(
      ProductStockPoolEntity,
      {
        inventory: input.inventoryId,
        custody: ProductStockPoolCustody.SELLER,
        isDefault: true,
        lifecycleState: { $ne: ProductStockPoolLifecycleState.REMOVED },
      },
      {
        fields: ['id'],
        limit: 1,
        disableIdentityMap: true,
        flushMode: FlushMode.COMMIT,
      },
    );
    return pools[0]?.id ?? null;
  }

  /**
   * Raw SQL is required: the version predicate, the update, the ledger insert
   * and the returned post-update balance must be one atomic statement, and the
   * `on conflict ... where command_id is not null` clause targets a partial
   * unique index that upsert inference cannot express per-row.
   */
  async countSellerPool(
    entityManager: EntityManager,
    input: CountSellerPoolInput,
  ): Promise<StockPoolBalance> {
    const poolId = await this.findSellerPoolId(entityManager, { inventoryId: input.inventoryId });
    if (!poolId) throw new StockPoolNotFoundError(input.inventoryId);

    const rows = await entityManager.execute<PoolBalanceRow[]>(
      `
        with pool as (
          select id, on_hand_quantity, reserved_quantity, on_hand_version
          from product_stock_pool
          where id = ?::uuid
          for update
        ),
        updated as (
          update product_stock_pool
          set on_hand_quantity = ?,
              on_hand_version = product_stock_pool.on_hand_version + 1,
              stock = greatest(? - product_stock_pool.reserved_quantity, 0),
              updated_at = now()
          from pool
          where product_stock_pool.id = pool.id
            and pool.on_hand_version = ?
          returning product_stock_pool.id,
                    product_stock_pool.on_hand_quantity,
                    product_stock_pool.reserved_quantity,
                    product_stock_pool.on_hand_version
        ),
        movement as (
          insert into inventory_movements (
            inventory_id, stock_pool_id, movement_kind, quantity_delta,
            on_hand_before, on_hand_after, reserved_before, reserved_after,
            cause, actor_type, actor_id, command_id, note
          )
          select ?::uuid, updated.id, 'seller_count',
                 updated.on_hand_quantity - pool.on_hand_quantity,
                 pool.on_hand_quantity, updated.on_hand_quantity,
                 pool.reserved_quantity, updated.reserved_quantity,
                 'product_variant_configuration', ?, ?, ?, nullif(?, '')
          from updated join pool on pool.id = updated.id
          on conflict (command_id, stock_pool_id, movement_kind)
            where command_id is not null do nothing
        )
        select updated.id as stock_pool_id,
               updated.on_hand_quantity,
               updated.reserved_quantity,
               updated.on_hand_version
        from updated
      `,
      [
        poolId,
        input.onHandQuantity,
        input.onHandQuantity,
        input.expectedOnHandVersion,
        input.inventoryId,
        input.actorId ? 'user' : null,
        input.actorId ?? null,
        input.commandId ?? null,
        input.note ?? '',
      ],
    );

    const updated = rows[0];
    if (updated) return toBalance(updated);

    const current = await this.readPoolBalance(entityManager, poolId);
    if (!current) throw new StockPoolNotFoundError(input.inventoryId);
    throw new StockPoolVersionConflictError(current, input.inventoryId);
  }

  private async readPoolBalance(
    entityManager: EntityManager,
    poolId: string,
  ): Promise<StockPoolBalance | null> {
    // Same reason as `findSellerPoolId`: this runs on the version-conflict path
    // and must report the committed row rather than a stale identity-map copy.
    const pool = await entityManager.findOne(
      ProductStockPoolEntity,
      { id: poolId },
      { disableIdentityMap: true, flushMode: FlushMode.COMMIT },
    );
    if (!pool) return null;

    return toBalance({
      stock_pool_id: pool.id,
      on_hand_quantity: pool.onHandQuantity,
      reserved_quantity: pool.reservedQuantity,
      on_hand_version: pool.onHandVersion,
    });
  }
}

function toBalance(row: PoolBalanceRow): StockPoolBalance {
  return {
    stockPoolId: row.stock_pool_id,
    onHandQuantity: row.on_hand_quantity,
    reservedQuantity: row.reserved_quantity,
    onHandVersion: row.on_hand_version,
    availableQuantity: Math.max(0, row.on_hand_quantity - row.reserved_quantity),
    shortage: Math.max(0, row.reserved_quantity - row.on_hand_quantity),
  };
}
