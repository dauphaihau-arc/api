import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  buildProductInventoryUpdatedSseEvent,
  type ProductInventoryUpdatedSseEventPayload,
} from '../../../product/app/events/product-inventory-sse.event';
import {
  CheckoutQuoteReservationUnavailableError,
  CheckoutQuoteReservationOutOfStockError,
} from '../../../order/app/errors/order-app.error';
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
    private readonly stockReservationCommandRepository: CheckoutStockReservationCommandRepository,
  ) {}

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

  async reserveForOrder(
    transactionalEntityManager: EntityManager,
    input: {
      orderId: string;
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

    const { reservedCount } = await this.stockReservationCommandRepository.reserveForOrder(
      transactionalEntityManager,
      {
        orderId: input.orderId,
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

  async consumeReservationsForOrder(
    entityManager: EntityManager,
    input: {
      orderId: string;
      items: Array<{ inventoryId: string; quantity: number }>;
      consumedAt?: Date;
    },
  ): Promise<void> {
    const now = input.consumedAt ?? new Date();
    const requestedItems = aggregateByInventoryId(input.items);

    const { consumedCount } = await this.stockReservationCommandRepository.consumeReservationsForOrder(
      entityManager,
      {
        orderId: input.orderId,
        consumedAt: now,
        items: requestedItems,
      },
    );

    if (consumedCount !== requestedItems.length) {
      throw new CheckoutQuoteReservationUnavailableError();
    }
  }

  async expireReservationsForOrder(
    entityManager: EntityManager,
    orderId: string,
    options?: { expiredAt?: Date; reservationId?: string },
  ): Promise<number> {
    const now = options?.expiredAt ?? new Date();
    const { releasedCount } = await this.stockReservationCommandRepository.expireActiveReservationsForOrder(
      entityManager,
      {
        orderId,
        expiresAtOrBefore: now,
        releasedAt: now,
      },
    );

    return releasedCount;
  }

  async releaseReservationsForOrder(
    entityManager: EntityManager,
    orderId: string,
    options?: { releasedAt?: Date; reservationId?: string },
  ): Promise<number> {
    const now = options?.releasedAt ?? new Date();
    const { releasedCount } = await this.stockReservationCommandRepository.releaseActiveReservationsForOrder(
      entityManager,
      {
        orderId,
        releasedAt: now,
      },
    );

    return releasedCount;
  }

  async cleanupExpiredForOrder(
    orderId: string,
    options?: { now?: Date; reservationId?: string },
  ): Promise<number> {
    return this.entityManager.transactional(async (entityManager) =>
      this.expireReservationsForOrder(entityManager, orderId, {
        expiredAt: options?.now,
        reservationId: options?.reservationId,
      }));
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
