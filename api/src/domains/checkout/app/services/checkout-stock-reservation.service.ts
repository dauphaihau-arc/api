import { EntityManager } from '@mikro-orm/postgresql';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildProductInventoryUpdatedSseEvent,
  type ProductInventoryUpdatedSseEventPayload,
} from '../../../product/app/events/product-inventory-sse.event';
import type { ProductInventoryEntity } from '../../../product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import {
  CheckoutQuoteReservationUnavailableError,
  CheckoutQuoteReservationOutOfStockError,
} from '../../../order/app/errors/order-app.error';
import { CheckoutInventoryQueryRepository } from '../ports/checkout-inventory-query.repository';
import { CheckoutStockReservationCommandRepository } from '../ports/checkout-stock-reservation-command.repository';
import {
  CheckoutStockReservationPort,
  type InventoryMutationOptions,
} from '../ports/checkout-stock-reservation.port';

/**
 * Local Inventory implementation of the Stock Reservation port. It shapes the
 * request, maps persistence outcomes to application errors, and builds the
 * resulting inventory events; the balance changes themselves belong to
 * `CheckoutStockReservationCommandRepository`, which applies every one of them
 * to the authoritative `product_stock_pool`.
 *
 * One row per Inventory Item: the single default seller Stock Pool holds the
 * reserved quantity for the whole requested amount.
 */
@Injectable()
export class CheckoutStockReservationService implements CheckoutStockReservationPort {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly checkoutInventoryQueryRepository: CheckoutInventoryQueryRepository,
    private readonly stockReservationCommandRepository: CheckoutStockReservationCommandRepository,
  ) {}

  async allocateInventoryForOrderItems(
    entityManager: EntityManager,
    items: Array<{
      inventoryId: string;
      productId: string;
      quantity: number;
      title: string;
    }>,
    options: InventoryMutationOptions = {},
  ): Promise<{
    inventoryById: Map<string, ProductInventoryEntity>;
    inventoryEvents: ProductInventoryUpdatedSseEventPayload[];
  }> {
    const requestedItems = aggregateByInventoryId(items);
    const inventoryById = await this.loadInventoryById(entityManager, requestedItems);

    const balances = await this.stockReservationCommandRepository.applySaleForOrderItems(
      entityManager,
      requestedItems,
      {
        commandId: options.commandId ?? `allocate:${requestedItems.map((item) => item.inventoryId).join(',')}`,
        cause: options.cause ?? 'order_created',
      },
    );

    const inventoryEvents: ProductInventoryUpdatedSseEventPayload[] = [];

    for (const item of requestedItems) {
      const balance = balances.get(item.inventoryId);

      if (!balance) {
        throw new BadRequestException(`Insufficient stock for ${item.title}`);
      }

      const inventory = inventoryById.get(item.inventoryId)!;
      inventory.onHandQuantity = balance.onHandQuantity;
      inventory.reservedQuantity = balance.reservedQuantity;
      inventory.stock = Math.max(0, balance.onHandQuantity - balance.reservedQuantity);
      inventoryEvents.push(buildProductInventoryUpdatedSseEvent({
        productId: item.productId,
        inventoryId: inventory.id,
        stock: inventory.availableQuantity,
      }));
    }

    return { inventoryById, inventoryEvents };
  }

  async restoreInventoryForOrderItems(
    entityManager: EntityManager,
    items: Array<{
      inventoryId: string;
      productId: string;
      quantity: number;
    }>,
    options: InventoryMutationOptions = {},
  ): Promise<ProductInventoryUpdatedSseEventPayload[]> {
    const requestedItems = aggregateByInventoryId(items);

    const balances = await this.stockReservationCommandRepository.correctSaleForOrderItems(
      entityManager,
      requestedItems,
      {
        commandId: options.commandId ?? `restore:${requestedItems.map((item) => item.inventoryId).join(',')}`,
        cause: options.cause ?? 'order_canceled',
      },
    );

    const inventoryEvents: ProductInventoryUpdatedSseEventPayload[] = [];

    for (const item of requestedItems) {
      const balance = balances.get(item.inventoryId);

      if (!balance) {
        continue;
      }

      inventoryEvents.push(buildProductInventoryUpdatedSseEvent({
        productId: item.productId,
        inventoryId: item.inventoryId,
        stock: Math.max(0, balance.onHandQuantity - balance.reservedQuantity),
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
      items: Array<{
        inventoryId: string;
        quantity: number;
        title: string;
      }>;
    },
  ): Promise<void> {
    const requestedItems = aggregateByInventoryId(input.items);

    await transactionalEntityManager.flush();

    const { reservedCount } = await this.stockReservationCommandRepository.reserveForQuote(
      transactionalEntityManager,
      {
        quoteId: input.quoteId,
        cartId: input.cartId,
        expiresAt: input.expiresAt,
        items: requestedItems,
      },
    );

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
    const requestedItems = aggregateByInventoryId(input.items);

    const { consumedCount } = await this.stockReservationCommandRepository.consumeReservationsForQuote(
      entityManager,
      {
        quoteId: input.quoteId,
        consumedAt: now,
        items: requestedItems,
      },
    );

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
    const { releasedCount } = await this.stockReservationCommandRepository.expireActiveReservationsForQuote(
      entityManager,
      {
        quoteId,
        expiresAtOrBefore: now,
        releasedAt: now,
      },
    );

    return releasedCount;
  }

  async releaseReservationsForQuote(
    entityManager: EntityManager,
    quoteId: string,
    releasedAt?: Date,
  ): Promise<number> {
    const now = releasedAt ?? new Date();
    const { releasedCount } = await this.stockReservationCommandRepository.releaseActiveReservationsForQuote(
      entityManager,
      {
        quoteId,
        releasedAt: now,
      },
    );

    return releasedCount;
  }

  async cleanupExpiredForQuote(quoteId: string, now = new Date()): Promise<number> {
    return this.entityManager.transactional(async (entityManager) =>
      this.expireReservationsForQuote(entityManager, quoteId, now));
  }

  private async loadInventoryById(
    entityManager: EntityManager,
    items: Array<{ inventoryId: string }>,
  ): Promise<Map<string, ProductInventoryEntity>> {
    const inventoryById = await this.checkoutInventoryQueryRepository.findByIds(
      items.map((item) => item.inventoryId),
      { entityManager },
    );

    for (const item of items) {
      if (!inventoryById.has(item.inventoryId)) {
        throw new NotFoundException('Inventory not found');
      }
    }

    return inventoryById;
  }
}

/**
 * One row per Inventory Item: repeated requests for the same Item collapse into
 * the whole requested quantity, so a batch can never take the same pool row
 * twice inside one statement.
 */
function aggregateByInventoryId<T extends { inventoryId: string; quantity: number }>(
  items: T[],
): T[] {
  const byInventoryId = new Map<string, T>();

  for (const item of items) {
    const existing = byInventoryId.get(item.inventoryId);
    if (existing) {
      existing.quantity += item.quantity;
      continue;
    }

    byInventoryId.set(item.inventoryId, { ...item });
  }

  return [...byInventoryId.values()].sort((left, right) =>
    left.inventoryId.localeCompare(right.inventoryId));
}
