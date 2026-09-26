import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  CheckoutStockReservationCommandRepository,
  type ConsumeReservationsForQuoteInput,
  type ExpireQuoteReservationsInput,
  type QuoteReservationReleaseInput,
  type ReserveForQuoteInput,
  type StockBalanceAfterMutation,
  type StockItemQuantity,
  type StockMutationCommand,
} from '../../../app/ports/checkout-stock-reservation-command.repository';
import { CheckoutStockReservationStatus } from '../entities/checkout-stock-reservation.entity';

type StockBalanceRow = {
  stock_pool_id: string;
  inventory_id: string;
  on_hand_quantity: number;
  reserved_quantity: number;
};

/**
 * MikroORM-backed Stock Reservation accounting.
 *
 * Every balance change is raw SQL on purpose: each one has to lock the
 * Inventory Item rows, then the Stock Pool rows, evaluate the availability
 * guard, apply the delta, and write the matching Inventory Movement inside one
 * statement snapshot. MikroORM has no equivalent for a conditional multi-row
 * update whose read-back comes from the same statement.
 *
 * Caller contract: pass the EntityManager of the transaction that already owns
 * the change. These statements take locks in `product_inventory` id order and
 * then `product_stock_pool` id order, so a retry can neither double-apply nor
 * invert that order.
 */
@Injectable()
export class MikroOrmCheckoutStockReservationCommandRepository
implements CheckoutStockReservationCommandRepository {
  async applySaleForOrderItems(
    entityManager: EntityManager,
    items: StockItemQuantity[],
    command: StockMutationCommand,
  ): Promise<Map<string, StockBalanceAfterMutation>> {
    if (items.length === 0) {
      return new Map();
    }

    const requestedValues = items.map(() => '(?::uuid, ?::int)').join(', ');
    const params: Array<string | number> = items.flatMap((item) => [
      item.inventoryId,
      item.quantity,
    ]);
    params.push(command.commandId, command.cause, command.commandId);

    const rows = await entityManager.execute<StockBalanceRow[]>(
      `
        with requested(inventory_id, quantity) as (
          values ${requestedValues}
        ),
        locked_inventory as (
          select inventory.id
          from product_inventory inventory
          join requested on requested.inventory_id = inventory.id
          order by inventory.id
          for update
        ),
        locked_pool as (
          select pool.id as stock_pool_id,
                 pool.inventory_id,
                 pool.on_hand_quantity,
                 pool.reserved_quantity,
                 requested.quantity
          from product_stock_pool pool
          join requested on requested.inventory_id = pool.inventory_id
          join locked_inventory on locked_inventory.id = pool.inventory_id
          where pool.is_default = true
            and pool.custody = 'seller'
          order by pool.id
          for update
        ),
        sale_check as (
          select (select count(*) from locked_pool) = (select count(*) from requested)
             and not exists (
               select 1 from locked_pool
               where greatest(on_hand_quantity - reserved_quantity, 0) < quantity
             ) as can_sell
        ),
        updated_pool as (
          update product_stock_pool
          set on_hand_quantity = product_stock_pool.on_hand_quantity - locked_pool.quantity,
              stock = greatest((product_stock_pool.on_hand_quantity - locked_pool.quantity) - product_stock_pool.reserved_quantity, 0),
              updated_at = now()
          from locked_pool
          where (select can_sell from sale_check)
            and product_stock_pool.id = locked_pool.stock_pool_id
            and not exists (
              select 1
              from inventory_movements movement
              where movement.command_id = ?::text
                and movement.stock_pool_id = locked_pool.stock_pool_id
                and movement.movement_kind = 'sale'
            )
          returning product_stock_pool.id as stock_pool_id,
                    product_stock_pool.inventory_id,
                    product_stock_pool.on_hand_quantity,
                    product_stock_pool.reserved_quantity
        ),
        movements as (
          insert into inventory_movements (
            inventory_id,
            stock_pool_id,
            movement_kind,
            quantity_delta,
            on_hand_before,
            on_hand_after,
            reserved_before,
            reserved_after,
            cause,
            command_id
          )
          select locked_pool.inventory_id,
                 locked_pool.stock_pool_id,
                 'sale',
                 -locked_pool.quantity,
                 updated_pool.on_hand_quantity + locked_pool.quantity,
                 updated_pool.on_hand_quantity,
                 updated_pool.reserved_quantity,
                 updated_pool.reserved_quantity,
                 ?::text,
                 ?::text
          from locked_pool
          join updated_pool on updated_pool.stock_pool_id = locked_pool.stock_pool_id
          on conflict (command_id, stock_pool_id, movement_kind) where command_id is not null do nothing
        )
        select stock_pool_id, inventory_id, on_hand_quantity, reserved_quantity
        from updated_pool
      `,
      params,
    );

    return new Map(rows.map((row) => [row.inventory_id, {
      onHandQuantity: row.on_hand_quantity,
      reservedQuantity: row.reserved_quantity,
    }]));
  }

  async correctSaleForOrderItems(
    entityManager: EntityManager,
    items: StockItemQuantity[],
    command: StockMutationCommand,
  ): Promise<Map<string, StockBalanceAfterMutation>> {
    if (items.length === 0) {
      return new Map();
    }

    const requestedValues = items.map(() => '(?::uuid, ?::int)').join(', ');
    const params: Array<string | number> = items.flatMap((item) => [
      item.inventoryId,
      item.quantity,
    ]);
    params.push(command.commandId, command.cause, command.commandId);

    const rows = await entityManager.execute<StockBalanceRow[]>(
      `
        with requested(inventory_id, quantity) as (
          values ${requestedValues}
        ),
        locked_inventory as (
          select inventory.id
          from product_inventory inventory
          join requested on requested.inventory_id = inventory.id
          order by inventory.id
          for update
        ),
        locked_pool as (
          select pool.id as stock_pool_id,
                 pool.inventory_id,
                 pool.on_hand_quantity,
                 pool.reserved_quantity,
                 requested.quantity
          from product_stock_pool pool
          join requested on requested.inventory_id = pool.inventory_id
          join locked_inventory on locked_inventory.id = pool.inventory_id
          where pool.custody = 'seller'
            and pool.is_default = true
          order by pool.id
          for update
        ),
        updated_pool as (
          update product_stock_pool
          set on_hand_quantity = product_stock_pool.on_hand_quantity + locked_pool.quantity,
              stock = greatest((product_stock_pool.on_hand_quantity + locked_pool.quantity) - product_stock_pool.reserved_quantity, 0),
              updated_at = now()
          from locked_pool
          where product_stock_pool.id = locked_pool.stock_pool_id
            and not exists (
              select 1
              from inventory_movements movement
              where movement.command_id = ?::text
                and movement.stock_pool_id = locked_pool.stock_pool_id
                and movement.movement_kind = 'correction'
            )
          returning product_stock_pool.id as stock_pool_id,
                    product_stock_pool.inventory_id,
                    product_stock_pool.on_hand_quantity,
                    product_stock_pool.reserved_quantity
        ),
        movements as (
          insert into inventory_movements (
            inventory_id,
            stock_pool_id,
            movement_kind,
            quantity_delta,
            on_hand_before,
            on_hand_after,
            reserved_before,
            reserved_after,
            cause,
            command_id
          )
          select locked_pool.inventory_id,
                 locked_pool.stock_pool_id,
                 'correction',
                 locked_pool.quantity,
                 updated_pool.on_hand_quantity - locked_pool.quantity,
                 updated_pool.on_hand_quantity,
                 updated_pool.reserved_quantity,
                 updated_pool.reserved_quantity,
                 ?::text,
                 ?::text
          from locked_pool
          join updated_pool on updated_pool.stock_pool_id = locked_pool.stock_pool_id
          on conflict (command_id, stock_pool_id, movement_kind) where command_id is not null do nothing
        )
        select stock_pool_id, inventory_id, on_hand_quantity, reserved_quantity
        from updated_pool
      `,
      params,
    );

    const inventoryIds = [...new Set(rows.map((row) => row.inventory_id))];
    if (inventoryIds.length === 0) {
      return new Map();
    }

    // Corrections report the derived aggregate, not the pool row: availability
    // reads and the inventory event both come from `product_inventory`.
    const aggregateRows = await entityManager.execute<Array<{
      id: string;
      on_hand_quantity: number;
      reserved_quantity: number;
    }>>(
      `
        select id, on_hand_quantity, reserved_quantity
        from product_inventory
        where id in (${inventoryIds.map(() => '?::uuid').join(', ')})
      `,
      inventoryIds,
    );

    return new Map(aggregateRows.map((row) => [row.id, {
      onHandQuantity: row.on_hand_quantity,
      reservedQuantity: row.reserved_quantity,
    }]));
  }

  async reserveForQuote(
    entityManager: EntityManager,
    input: ReserveForQuoteInput,
  ): Promise<{ reservedCount: number }> {
    if (input.items.length === 0) {
      return { reservedCount: 0 };
    }

    const requestedValues = input.items.map(() => '(?::uuid, ?::int)').join(', ');
    const params: Array<string | number | Date> = input.items.flatMap((item) => [
      item.inventoryId,
      item.quantity,
    ]);
    params.push(input.quoteId, input.cartId, input.expiresAt, `${input.quoteId}:reserve`);

    const rows = await entityManager.execute<Array<{ reserved_count: string | number }>>(
      `
        with requested(inventory_id, quantity) as (
          values ${requestedValues}
        ),
        requested_count as (
          select count(*) as total from requested
        ),
        requested_inventory as (
          select distinct inventory_id from requested
        ),
        locked_inventory as (
          select inventory.id
          from product_inventory inventory
          join requested_inventory on requested_inventory.inventory_id = inventory.id
          order by inventory.id
          for update
        ),
        locked_pool as (
          select
            pool.id as stock_pool_id,
            pool.inventory_id,
            pool.on_hand_quantity,
            pool.reserved_quantity,
            greatest(pool.on_hand_quantity - pool.reserved_quantity, 0) as available_quantity,
            requested.quantity
          from product_stock_pool pool
          join requested on requested.inventory_id = pool.inventory_id
          join locked_inventory on locked_inventory.id = pool.inventory_id
          where pool.lifecycle_state = 'active'
            and pool.custody = 'seller'
            and pool.is_default = true
          order by pool.id
          for update
        ),
        reservation_check as (
          select
            (select count(*) from locked_pool) = (select total from requested_count)
            and not exists (
              select 1 from locked_pool where available_quantity < quantity
            ) as can_reserve
        ),
        updated_pool as (
          update product_stock_pool
          set reserved_quantity = product_stock_pool.reserved_quantity + locked_pool.quantity,
              stock = greatest(product_stock_pool.on_hand_quantity - (product_stock_pool.reserved_quantity + locked_pool.quantity), 0),
              updated_at = now()
          from locked_pool
          where (select can_reserve from reservation_check)
            and product_stock_pool.id = locked_pool.stock_pool_id
          returning
            product_stock_pool.id as stock_pool_id,
            product_stock_pool.inventory_id,
            product_stock_pool.on_hand_quantity,
            product_stock_pool.reserved_quantity
        ),
        inserted_reservations as (
          insert into checkout_stock_reservations (
            created_at,
            updated_at,
            quote_id,
            inventory_id,
            stock_pool_id,
            cart_id,
            quantity,
            expires_at
          )
          select
            now(),
            now(),
            ?,
            locked_pool.inventory_id,
            locked_pool.stock_pool_id,
            ?,
            locked_pool.quantity,
            ?
          from locked_pool
          where (select can_reserve from reservation_check)
          returning inventory_id
        ),
        movements as (
          insert into inventory_movements (
            inventory_id,
            stock_pool_id,
            movement_kind,
            quantity_delta,
            on_hand_before,
            on_hand_after,
            reserved_before,
            reserved_after,
            cause,
            command_id
          )
          select
            locked_pool.inventory_id,
            locked_pool.stock_pool_id,
            'reserve',
            locked_pool.quantity,
            updated_pool.on_hand_quantity,
            updated_pool.on_hand_quantity,
            updated_pool.reserved_quantity - locked_pool.quantity,
            updated_pool.reserved_quantity,
            'checkout_quote',
            ?::text
          from locked_pool
          join updated_pool on updated_pool.stock_pool_id = locked_pool.stock_pool_id
          on conflict (command_id, stock_pool_id, movement_kind) where command_id is not null do nothing
        )
        select count(*) as reserved_count
        from inserted_reservations
      `,
      params,
    );

    return { reservedCount: Number(rows[0]?.reserved_count ?? 0) };
  }

  async consumeReservationsForQuote(
    entityManager: EntityManager,
    input: ConsumeReservationsForQuoteInput,
  ): Promise<{ consumedCount: number }> {
    if (input.items.length === 0) {
      return { consumedCount: 0 };
    }

    const requestedValues = input.items.map(() => '(?::uuid, ?::int)').join(', ');
    const params: Array<string | number | Date> = input.items.flatMap((item) => [
      item.inventoryId,
      item.quantity,
    ]);
    params.push(input.quoteId, input.consumedAt, input.consumedAt, `${input.quoteId}:consume`);

    const rows = await entityManager.execute<Array<{ consumed_count: string | number }>>(
      `
        with requested(inventory_id, quantity) as (
          values ${requestedValues}
        ),
        requested_count as (
          select count(*) as total from requested
        ),
        reserved as (
          select
            reservation.id as reservation_id,
            reservation.stock_pool_id,
            reservation.inventory_id,
            reservation.quantity
          from checkout_stock_reservations reservation
          where reservation.quote_id = ?
            and reservation.status = 'active'
            and reservation.expires_at > ?
          order by reservation.stock_pool_id
          for update
        ),
        reserved_totals as (
          select inventory_id, sum(quantity) as reserved_quantity
          from reserved
          group by inventory_id
        ),
        reservation_match as (
          select requested.inventory_id
          from requested
          join reserved_totals
            on reserved_totals.inventory_id = requested.inventory_id
           and reserved_totals.reserved_quantity = requested.quantity
        ),
        locked_pool as (
          select
            pool.id as stock_pool_id,
            pool.inventory_id,
            pool.on_hand_quantity,
            pool.reserved_quantity,
            reserved.quantity,
            reserved.reservation_id
          from product_stock_pool pool
          join reserved on reserved.stock_pool_id = pool.id
          order by pool.id
          for update
        ),
        consume_check as (
          select
            (select count(*) from reservation_match) = (select total from requested_count)
            and (select count(*) from locked_pool) = (select count(*) from reserved)
            and not exists (
              select 1 from locked_pool
              where on_hand_quantity < quantity or reserved_quantity < quantity
            ) as can_consume
        ),
        updated_pool as (
          update product_stock_pool
          set on_hand_quantity = product_stock_pool.on_hand_quantity - locked_pool.quantity,
              reserved_quantity = product_stock_pool.reserved_quantity - locked_pool.quantity,
              stock = greatest((product_stock_pool.on_hand_quantity - locked_pool.quantity) - (product_stock_pool.reserved_quantity - locked_pool.quantity), 0),
              updated_at = now()
          from locked_pool
          where (select can_consume from consume_check)
            and product_stock_pool.id = locked_pool.stock_pool_id
          returning
            product_stock_pool.id as stock_pool_id,
            product_stock_pool.inventory_id,
            product_stock_pool.on_hand_quantity,
            product_stock_pool.reserved_quantity
        ),
        consumed_reservations as (
          update checkout_stock_reservations
          set status = 'consumed', consumed_at = ?, updated_at = now()
          from locked_pool
          where (select can_consume from consume_check)
            and checkout_stock_reservations.id = locked_pool.reservation_id
          returning checkout_stock_reservations.inventory_id
        ),
        movements as (
          insert into inventory_movements (
            inventory_id,
            stock_pool_id,
            movement_kind,
            quantity_delta,
            on_hand_before,
            on_hand_after,
            reserved_before,
            reserved_after,
            cause,
            command_id
          )
          select
            locked_pool.inventory_id,
            locked_pool.stock_pool_id,
            'sale',
            -locked_pool.quantity,
            updated_pool.on_hand_quantity + locked_pool.quantity,
            updated_pool.on_hand_quantity,
            updated_pool.reserved_quantity + locked_pool.quantity,
            updated_pool.reserved_quantity,
            'order_created',
            ?::text
          from locked_pool
          join updated_pool on updated_pool.stock_pool_id = locked_pool.stock_pool_id
          on conflict (command_id, stock_pool_id, movement_kind) where command_id is not null do nothing
        )
        select count(distinct inventory_id) as consumed_count
        from consumed_reservations
      `,
      params,
    );

    return { consumedCount: Number(rows[0]?.consumed_count ?? 0) };
  }

  async expireActiveReservationsForQuote(
    entityManager: EntityManager,
    input: ExpireQuoteReservationsInput,
  ): Promise<{ releasedCount: number }> {
    return this.releaseQuoteReservations(entityManager, {
      quoteId: input.quoteId,
      releasedAt: input.releasedAt,
      commandId: `${input.quoteId}:expire`,
      cause: 'quote_expired',
      nextStatus: CheckoutStockReservationStatus.EXPIRED,
      expiresAtOrBefore: input.expiresAtOrBefore,
    });
  }

  async releaseActiveReservationsForQuote(
    entityManager: EntityManager,
    input: QuoteReservationReleaseInput,
  ): Promise<{ releasedCount: number }> {
    return this.releaseQuoteReservations(entityManager, {
      quoteId: input.quoteId,
      releasedAt: input.releasedAt,
      commandId: `${input.quoteId}:release`,
      cause: 'quote_released',
      nextStatus: CheckoutStockReservationStatus.RELEASED,
    });
  }

  /**
   * Expiring and releasing differ only in the recorded status, movement cause,
   * and whether the hold had already lapsed, so both share one statement: the
   * released rows are aggregated per Stock Pool before the pool balance and the
   * Inventory Movement are written.
   */
  private async releaseQuoteReservations(
    entityManager: EntityManager,
    input: {
      quoteId: string;
      releasedAt: Date;
      commandId: string;
      cause: string;
      nextStatus: CheckoutStockReservationStatus;
      expiresAtOrBefore?: Date;
    },
  ): Promise<{ releasedCount: number }> {
    const params: Array<string | number | Date> = [
      input.nextStatus,
      input.releasedAt,
      input.quoteId,
      CheckoutStockReservationStatus.ACTIVE,
    ];

    const expiresPredicate = input.expiresAtOrBefore
      ? 'and expires_at <= ?'
      : '';
    if (input.expiresAtOrBefore) {
      params.push(input.expiresAtOrBefore);
    }
    params.push(input.commandId, input.cause);

    const rows = await entityManager.execute<Array<{ released_count: string | number }>>(
      `
        with released as (
          update checkout_stock_reservations
          set status = ?, released_at = ?, updated_at = now()
          where quote_id = ?
            and status = ?
            ${expiresPredicate}
          returning stock_pool_id, inventory_id, quantity
        ),
        aggregated as (
          select stock_pool_id, inventory_id, sum(quantity) as quantity
          from released
          group by stock_pool_id, inventory_id
        ),
        updated_pool as (
          update product_stock_pool
          set reserved_quantity = greatest(product_stock_pool.reserved_quantity - aggregated.quantity, 0),
              stock = greatest(product_stock_pool.on_hand_quantity - greatest(product_stock_pool.reserved_quantity - aggregated.quantity, 0), 0),
              updated_at = now()
          from aggregated
          where product_stock_pool.id = aggregated.stock_pool_id
          returning
            product_stock_pool.id as stock_pool_id,
            product_stock_pool.inventory_id,
            product_stock_pool.on_hand_quantity,
            product_stock_pool.reserved_quantity
        ),
        movements as (
          insert into inventory_movements (
            inventory_id,
            stock_pool_id,
            movement_kind,
            quantity_delta,
            on_hand_before,
            on_hand_after,
            reserved_before,
            reserved_after,
            cause,
            command_id
          )
          select
            aggregated.inventory_id,
            aggregated.stock_pool_id,
            'release',
            aggregated.quantity,
            updated_pool.on_hand_quantity,
            updated_pool.on_hand_quantity,
            updated_pool.reserved_quantity + aggregated.quantity,
            updated_pool.reserved_quantity,
            ?::text,
            ?::text
          from aggregated
          join updated_pool on updated_pool.stock_pool_id = aggregated.stock_pool_id
          on conflict (command_id, stock_pool_id, movement_kind) where command_id is not null do nothing
        )
        select count(*) as released_count
        from released
      `,
      params,
    );

    return { releasedCount: Number(rows[0]?.released_count ?? 0) };
  }
}
