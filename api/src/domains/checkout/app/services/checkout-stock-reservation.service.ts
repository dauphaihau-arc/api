import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildProductInventoryUpdatedSseEvent,
} from '../../../product/app/events/product-inventory-sse.event';
import { ProductInventoryEntity } from '../../../product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import {
  CheckoutQuoteReservationUnavailableError,
  CheckoutQuoteReservationOutOfStockError,
} from '../../../order/app/errors/order-app.error';
import {
  CheckoutStockReservationStatus,
} from '../../infra/persistence/entities/checkout-stock-reservation.entity';
import { CheckoutStockReservationPort } from '../ports/checkout-stock-reservation.port';

@Injectable()
export class CheckoutStockReservationService implements CheckoutStockReservationPort {
  constructor(private readonly entityManager: EntityManager) {}

  async allocateInventoryForOrderItems(
    entityManager: EntityManager,
    items: Array<{
      inventoryId: string;
      productId: string;
      quantity: number;
      title: string;
    }>,
  ): Promise<{
    inventoryById: Map<string, ProductInventoryEntity>;
    inventoryEvents: Array<ReturnType<typeof buildProductInventoryUpdatedSseEvent>>;
  }> {
    const requestedItems = this.aggregateInventoryMutationItems(items);
    const inventoryById = await this.lockInventories(entityManager, requestedItems);
    const inventoryEvents: Array<ReturnType<typeof buildProductInventoryUpdatedSseEvent>> = [];

    for (const item of requestedItems) {
      const inventory = inventoryById.get(item.inventoryId);
      if (!inventory) {
        throw new NotFoundException('Inventory not found');
      }

      if (inventory.availableQuantity < item.quantity) {
        throw new BadRequestException(`Insufficient stock for ${item.title}`);
      }
    }

    for (const item of requestedItems) {
      const inventory = inventoryById.get(item.inventoryId)!;
      inventory.onHandQuantity -= item.quantity;
      inventory.stock = Math.max(0, inventory.onHandQuantity - inventory.reservedQuantity);
      inventoryEvents.push(buildProductInventoryUpdatedSseEvent({
        productId: item.productId,
        inventoryId: inventory.id,
        stock: inventory.availableQuantity,
      }));
    }

    return {
      inventoryById,
      inventoryEvents,
    };
  }

  async restoreInventoryForOrderItems(
    entityManager: EntityManager,
    items: Array<{
      inventoryId: string;
      productId: string;
      quantity: number;
    }>,
  ): Promise<Array<ReturnType<typeof buildProductInventoryUpdatedSseEvent>>> {
    const requestedItems = this.aggregateInventoryMutationItems(
      items.map((item) => ({ ...item, title: item.inventoryId })),
    );
    const inventoryById = await this.lockInventories(entityManager, requestedItems);
    const inventoryEvents: Array<ReturnType<typeof buildProductInventoryUpdatedSseEvent>> = [];

    for (const item of requestedItems) {
      const inventory = inventoryById.get(item.inventoryId);

      if (!inventory) {
        continue;
      }

      inventory.onHandQuantity += item.quantity;
      inventory.stock = Math.max(0, inventory.onHandQuantity - inventory.reservedQuantity);
      inventoryEvents.push(buildProductInventoryUpdatedSseEvent({
        productId: item.productId,
        inventoryId: inventory.id,
        stock: inventory.availableQuantity,
      }));
    }

    return inventoryEvents;
  }

  async reserveForQuote(
    transactionalEntityManager: EntityManager,
    input: {
      quoteId: string;
      cartId: string;
      expiresAt: Date;
      items: Array<{ inventoryId: string; quantity: number; title: string }>;
    },
  ): Promise<void> {
    const requestedItems = this.aggregateReservationItems(input.items);

    await transactionalEntityManager.flush();

    const reservedCount = await this.reserveInventoryAndInsertQuoteReservations(transactionalEntityManager, {
      quoteId: input.quoteId,
      cartId: input.cartId,
      expiresAt: input.expiresAt,
      items: requestedItems,
    });

    if (reservedCount !== requestedItems.length) {
      throw new CheckoutQuoteReservationOutOfStockError(
        requestedItems.find((item) => item.quantity > 0)?.title ?? 'Inventory',
      );
    }
  }

  async consumeReservationsForQuote(
    entityManager: EntityManager,
    input: {
      quoteId: string;
      items: Array<{ inventoryId: string; quantity: number }>;
      consumedAt?: Date;
    },
  ): Promise<void> {
    const now = input.consumedAt ?? new Date();
    const requestedItems = this.aggregateReservationItems(
      input.items.map((item) => ({ ...item, title: item.inventoryId })),
    );
    const consumedCount = await this.consumeReservedInventoryForQuote(entityManager, {
      quoteId: input.quoteId,
      consumedAt: now,
      items: requestedItems,
    });

    if (consumedCount !== requestedItems.length) {
      throw new CheckoutQuoteReservationUnavailableError();
    }
  }

  async expireReservationsForQuote(
    entityManager: EntityManager,
    quoteId: string,
    expiredAt?: Date,
  ): Promise<number> {
    const now = expiredAt ?? new Date();
    const rows = await entityManager.execute<Array<{
      expired_count: string | number;
    }>>(
      `
        with expired as (
          update checkout_stock_reservations
          set status = ?, released_at = ?, updated_at = now()
          where quote_id = ?
            and status = ?
            and expires_at <= ?
          returning inventory_id, quantity
        ),
        restored as (
          select inventory_id, sum(quantity) as quantity
          from expired
          group by inventory_id
        ),
        updated_inventory as (
          update product_inventory
          set reserved_quantity = greatest(product_inventory.reserved_quantity - restored.quantity, 0),
              stock = greatest(product_inventory.on_hand_quantity - greatest(product_inventory.reserved_quantity - restored.quantity, 0), 0),
              updated_at = now()
          from restored
          where product_inventory.id = restored.inventory_id
          returning product_inventory.id, product_inventory.on_hand_quantity, product_inventory.reserved_quantity
        ),
        movements as (
          insert into inventory_movements (
            created_at,
            updated_at,
            inventory_id,
            movement_kind,
            quantity_delta,
            on_hand_before,
            reserved_before,
            on_hand_after,
            reserved_after,
            cause,
            command_id
          )
          select
            now(),
            now(),
            restored.inventory_id,
            'release',
            restored.quantity,
            updated_inventory.on_hand_quantity,
            updated_inventory.reserved_quantity + restored.quantity,
            updated_inventory.on_hand_quantity,
            updated_inventory.reserved_quantity,
            'quote_expired',
            ?::text
          from restored
          join updated_inventory on updated_inventory.id = restored.inventory_id
          on conflict (command_id, inventory_id, movement_kind) where command_id is not null do nothing
        )
        select count(*) as expired_count
        from expired
      `,
      [
        CheckoutStockReservationStatus.EXPIRED,
        now,
        quoteId,
        CheckoutStockReservationStatus.ACTIVE,
        now,
        `${quoteId}:expire`,
      ],
    );

    return Number(rows[0]?.expired_count ?? 0);
  }

  async releaseReservationsForQuote(
    entityManager: EntityManager,
    quoteId: string,
    releasedAt?: Date,
  ): Promise<number> {
    const now = releasedAt ?? new Date();
    const rows = await entityManager.execute<Array<{
      released_count: string | number;
    }>>(
      `
        with released as (
          update checkout_stock_reservations
          set status = ?, released_at = ?, updated_at = now()
          where quote_id = ?
            and status = ?
          returning inventory_id, quantity
        ),
        restored as (
          select inventory_id, sum(quantity) as quantity
          from released
          group by inventory_id
        ),
        updated_inventory as (
          update product_inventory
          set reserved_quantity = greatest(product_inventory.reserved_quantity - restored.quantity, 0),
              stock = greatest(product_inventory.on_hand_quantity - greatest(product_inventory.reserved_quantity - restored.quantity, 0), 0),
              updated_at = now()
          from restored
          where product_inventory.id = restored.inventory_id
          returning product_inventory.id, product_inventory.on_hand_quantity, product_inventory.reserved_quantity
        ),
        movements as (
          insert into inventory_movements (
            created_at,
            updated_at,
            inventory_id,
            movement_kind,
            quantity_delta,
            on_hand_before,
            reserved_before,
            on_hand_after,
            reserved_after,
            cause,
            command_id
          )
          select
            now(),
            now(),
            restored.inventory_id,
            'release',
            restored.quantity,
            updated_inventory.on_hand_quantity,
            updated_inventory.reserved_quantity + restored.quantity,
            updated_inventory.on_hand_quantity,
            updated_inventory.reserved_quantity,
            'quote_released',
            ?::text
          from restored
          join updated_inventory on updated_inventory.id = restored.inventory_id
          on conflict (command_id, inventory_id, movement_kind) where command_id is not null do nothing
        )
        select count(*) as released_count
        from released
      `,
      [
        CheckoutStockReservationStatus.RELEASED,
        now,
        quoteId,
        CheckoutStockReservationStatus.ACTIVE,
        `${quoteId}:release`,
      ],
    );

    return Number(rows[0]?.released_count ?? 0);
  }

  async cleanupExpiredForQuote(quoteId: string, now = new Date()): Promise<number> {
    return this.entityManager.transactional(async (entityManager) =>
      this.expireReservationsForQuote(entityManager, quoteId, now));
  }

  private async lockInventories(
    entityManager: EntityManager,
    items: Array<{ inventoryId: string }>,
  ): Promise<Map<string, ProductInventoryEntity>> {
    const inventoryIds = items.map((item) => item.inventoryId);
    if (inventoryIds.length === 0) {
      return new Map();
    }

    const inventories = await entityManager.getRepository(ProductInventoryEntity).find(
      { id: { $in: inventoryIds } },
      {
        lockMode: LockMode.PESSIMISTIC_WRITE,
        orderBy: { id: 'asc' },
      },
    );

    return new Map(inventories.map((inventory) => [inventory.id, inventory]));
  }

  private async reserveInventoryAndInsertQuoteReservations(
    entityManager: EntityManager,
    input: {
      quoteId: string;
      cartId: string;
      expiresAt: Date;
      items: Array<{ inventoryId: string; quantity: number }>;
    },
  ): Promise<number> {
    if (input.items.length === 0) {
      return 0;
    }

    const requestedValues = input.items.map(() => '(?::uuid, ?::int)').join(', ');
    const params: Array<string | number | Date> = input.items.flatMap((item) => [
      item.inventoryId,
      item.quantity,
    ]);
    params.push(input.quoteId, input.cartId, input.expiresAt, `${input.quoteId}:reserve`);

    const rows = await entityManager.execute<Array<{
      reserved_count: string | number;
    }>>(
      `
        with requested(inventory_id, quantity) as (
          values ${requestedValues}
        ),
        requested_count as (
          select count(*) as total from requested
        ),
        locked_inventory as (
          select
            product_inventory.id,
            product_inventory.on_hand_quantity,
            product_inventory.reserved_quantity,
            greatest(product_inventory.on_hand_quantity - product_inventory.reserved_quantity, 0) as available_quantity,
            requested.quantity
          from product_inventory
          join requested
            on requested.inventory_id = product_inventory.id
          order by product_inventory.id
          for update
        ),
        reservation_check as (
          select
            (select count(*) from locked_inventory) = (select total from requested_count)
            and not exists (
              select 1
              from locked_inventory
              where available_quantity < quantity
            ) as can_reserve
        ),
        updated_inventory as (
          update product_inventory
          set reserved_quantity = product_inventory.reserved_quantity + requested.quantity,
              stock = greatest(product_inventory.on_hand_quantity - (product_inventory.reserved_quantity + requested.quantity), 0),
              updated_at = now()
          from requested
          where (select can_reserve from reservation_check)
            and product_inventory.id = requested.inventory_id
          returning product_inventory.id, product_inventory.on_hand_quantity, product_inventory.reserved_quantity
        ),
        updated_count as (
          select count(*) as total from updated_inventory
        ),
        inserted_reservations as (
        insert into checkout_stock_reservations (
          created_at,
          updated_at,
          quote_id,
          inventory_id,
          cart_id,
          quantity,
          expires_at
        )
          select
            now(),
            now(),
            ?,
            requested.inventory_id,
            ?,
            requested.quantity,
            ?
          from requested
          where (select can_reserve from reservation_check)
            and (select total from updated_count) = (select total from requested_count)
          returning id
        ),
        movements as (
          insert into inventory_movements (
            created_at,
            updated_at,
            inventory_id,
            movement_kind,
            quantity_delta,
            on_hand_before,
            reserved_before,
            on_hand_after,
            reserved_after,
            cause,
            command_id
          )
          select
            now(),
            now(),
            requested.inventory_id,
            'reserve',
            requested.quantity,
            updated_inventory.on_hand_quantity,
            updated_inventory.reserved_quantity - requested.quantity,
            updated_inventory.on_hand_quantity,
            updated_inventory.reserved_quantity,
            'checkout_quote',
            ?::text
          from requested
          join updated_inventory on updated_inventory.id = requested.inventory_id
          on conflict (command_id, inventory_id, movement_kind) where command_id is not null do nothing
        )
        select count(*) as reserved_count
        from inserted_reservations
      `,
      params,
    );

    return Number(rows[0]?.reserved_count ?? 0);
  }

  private async consumeReservedInventoryForQuote(
    entityManager: EntityManager,
    input: {
      quoteId: string;
      consumedAt: Date;
      items: Array<{ inventoryId: string; quantity: number }>;
    },
  ): Promise<number> {
    if (input.items.length === 0) {
      return 0;
    }

    const requestedValues = input.items.map(() => '(?::uuid, ?::int)').join(', ');
    const params: Array<string | number | Date> = input.items.flatMap((item) => [
      item.inventoryId,
      item.quantity,
    ]);
    params.push(input.quoteId, input.consumedAt);

    const rows = await entityManager.execute<Array<{
      consumed_count: string | number;
    }>>(
      `
        with requested(inventory_id, quantity) as (
          values ${requestedValues}
        ),
        requested_count as (
          select count(*) as total from requested
        ),
        reserved as (
          select
            checkout_stock_reservations.id as reservation_id,
            checkout_stock_reservations.inventory_id,
            checkout_stock_reservations.quantity
          from checkout_stock_reservations
          join requested
            on requested.inventory_id = checkout_stock_reservations.inventory_id
           and requested.quantity = checkout_stock_reservations.quantity
          where checkout_stock_reservations.quote_id = ?
            and checkout_stock_reservations.status = 'active'
            and checkout_stock_reservations.expires_at > ?
          order by checkout_stock_reservations.inventory_id
          for update
        ),
        locked_inventory as (
          select
            product_inventory.id,
            product_inventory.on_hand_quantity,
            product_inventory.reserved_quantity,
            reserved.quantity
          from product_inventory
          join reserved
            on reserved.inventory_id = product_inventory.id
          order by product_inventory.id
          for update
        ),
        consume_check as (
          select
            (select count(*) from reserved) = (select total from requested_count)
            and not exists (
              select 1
              from locked_inventory
              where on_hand_quantity < quantity
                 or reserved_quantity < quantity
            ) as can_consume
        ),
        updated_inventory as (
          update product_inventory
          set on_hand_quantity = product_inventory.on_hand_quantity - reserved.quantity,
              reserved_quantity = product_inventory.reserved_quantity - reserved.quantity,
              stock = greatest((product_inventory.on_hand_quantity - reserved.quantity) - (product_inventory.reserved_quantity - reserved.quantity), 0),
              updated_at = now()
          from reserved
          where (select can_consume from consume_check)
            and product_inventory.id = reserved.inventory_id
          returning product_inventory.id, product_inventory.on_hand_quantity, product_inventory.reserved_quantity
        ),
        consumed_reservations as (
          update checkout_stock_reservations
          set status = 'consumed', consumed_at = ?, updated_at = now()
          from reserved
          where (select can_consume from consume_check)
            and checkout_stock_reservations.id = reserved.reservation_id
          returning checkout_stock_reservations.inventory_id
        ),
        movements as (
          insert into inventory_movements (
            created_at,
            updated_at,
            inventory_id,
            movement_kind,
            quantity_delta,
            on_hand_before,
            reserved_before,
            on_hand_after,
            reserved_after,
            cause,
            command_id
          )
          select
            now(),
            now(),
            reserved.inventory_id,
            'sale',
            -reserved.quantity,
            updated_inventory.on_hand_quantity + reserved.quantity,
            updated_inventory.reserved_quantity + reserved.quantity,
            updated_inventory.on_hand_quantity,
            updated_inventory.reserved_quantity,
            'order_created',
            ?::text
          from reserved
          join updated_inventory on updated_inventory.id = reserved.inventory_id
          on conflict (command_id, inventory_id, movement_kind) where command_id is not null do nothing
        )
        select count(*) as consumed_count
        from consumed_reservations
      `,
      [
        ...params,
        input.consumedAt,
        `${input.quoteId}:consume`,
      ],
    );

    return Number(rows[0]?.consumed_count ?? 0);
  }

  private aggregateReservationItems(
    items: Array<{ inventoryId: string; quantity: number; title: string }>,
  ): Array<{ inventoryId: string; quantity: number; title: string }> {
    const byInventoryId = new Map<string, { inventoryId: string; quantity: number; title: string }>();

    for (const item of items) {
      const existing = byInventoryId.get(item.inventoryId);
      if (existing) {
        existing.quantity += item.quantity;
        continue;
      }

      byInventoryId.set(item.inventoryId, { ...item });
    }

    return this.sortItemsByInventoryId([...byInventoryId.values()]);
  }

  private aggregateInventoryMutationItems(
    items: Array<{
      inventoryId: string;
      productId: string;
      quantity: number;
      title: string;
    }>,
  ): Array<{
    inventoryId: string;
    productId: string;
    quantity: number;
    title: string;
  }> {
    const byInventoryId = new Map<string, {
      inventoryId: string;
      productId: string;
      quantity: number;
      title: string;
    }>();

    for (const item of items) {
      const existing = byInventoryId.get(item.inventoryId);
      if (existing) {
        existing.quantity += item.quantity;
        continue;
      }

      byInventoryId.set(item.inventoryId, { ...item });
    }

    return this.sortItemsByInventoryId([...byInventoryId.values()]);
  }

  private sortItemsByInventoryId<T extends { inventoryId: string }>(items: T[]): T[] {
    return items.slice().sort((left, right) => left.inventoryId.localeCompare(right.inventoryId));
  }
}
