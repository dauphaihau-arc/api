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
  CheckoutStockReservationEntity,
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

      if (inventory.stock < item.quantity) {
        throw new BadRequestException(`Insufficient stock for ${item.title}`);
      }
    }

    for (const item of requestedItems) {
      const inventory = inventoryById.get(item.inventoryId)!;
      inventory.stock -= item.quantity;
      inventoryEvents.push(buildProductInventoryUpdatedSseEvent({
        productId: item.productId,
        inventoryId: inventory.id,
        stock: inventory.stock,
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

      inventory.stock += item.quantity;
      inventoryEvents.push(buildProductInventoryUpdatedSseEvent({
        productId: item.productId,
        inventoryId: inventory.id,
        stock: inventory.stock,
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
    const reservationRepository = entityManager.getRepository(CheckoutStockReservationEntity);
    const requestedItems = this.aggregateReservationItems(
      input.items.map((item) => ({ ...item, title: item.inventoryId })),
    );

    const reservations = await reservationRepository.find(
      {
        quote: input.quoteId,
        inventory: { $in: requestedItems.map((item) => item.inventoryId) },
        status: CheckoutStockReservationStatus.ACTIVE,
        expiresAt: { $gt: now },
      },
      {
        lockMode: LockMode.PESSIMISTIC_WRITE,
        orderBy: { inventory: 'asc' },
      },
    );
    const reservationByInventoryId = new Map(
      reservations.map((reservation) => [reservation.inventory.id, reservation]),
    );

    for (const item of requestedItems) {
      const reservation = reservationByInventoryId.get(item.inventoryId);
      if (!reservation || reservation.quantity !== item.quantity) {
        throw new CheckoutQuoteReservationUnavailableError();
      }
    }

    for (const reservation of reservations) {
      reservation.status = CheckoutStockReservationStatus.CONSUMED;
      reservation.consumedAt = now;
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
          set stock = product_inventory.stock + restored.quantity,
              updated_at = now()
          from restored
          where product_inventory.id = restored.inventory_id
          returning product_inventory.id
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
      ],
    );

    return Number(rows[0]?.expired_count ?? 0);
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
    params.push(input.quoteId, input.cartId, input.expiresAt);

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
          select product_inventory.id, product_inventory.stock, requested.quantity
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
              where stock < quantity
            ) as can_reserve
        ),
        updated_inventory as (
          update product_inventory
          set stock = product_inventory.stock - requested.quantity,
              updated_at = now()
          from requested
          where (select can_reserve from reservation_check)
            and product_inventory.id = requested.inventory_id
          returning product_inventory.id
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
        )
        select count(*) as reserved_count
        from inserted_reservations
      `,
      params,
    );

    return Number(rows[0]?.reserved_count ?? 0);
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
