import type { EntityManager } from '@mikro-orm/postgresql';
import type { ProductInventoryUpdatedSseEventPayload } from '../../../product/app/events/product-inventory-sse.event';

export interface InventoryMutationOptions {
  /**
   * Stable command identity recorded on the immutable Inventory Movement so a
   * retried command cannot apply the same balance change twice.
   */
  commandId?: string;
  cause?: string;
  /**
   * The remote authority restores a consumed sale through its recorded
   * reservation, so callers pass the purchase reservation identity.
   */
  reservationId?: string;
}

export abstract class CheckoutStockReservationPort {
  abstract restoreInventoryForOrderItems(
    entityManager: EntityManager,
    items: Array<{
      inventoryId: string;
      productId: string;
      quantity: number;
    }>,
    options?: InventoryMutationOptions,
  ): Promise<ProductInventoryUpdatedSseEventPayload[]>;

  /**
   * Creates the order-owned hold. `reservationId` is returned only by an
   * authority that assigns one (the remote inventory-service); the local
   * implementation records the hold rows and returns nothing.
   */
  abstract reserveForOrder(
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
  ): Promise<{ reservationId?: string } | void>;

  abstract consumeReservationsForOrder(
    entityManager: EntityManager,
    input: {
      orderId: string;
      /**
       * Remote-authority reservation identity. The local implementation
       * ignores it; the remote implementation validates the hold before the
       * Order is marked paid and lets `order.created` consume it.
       */
      reservationId?: string;
      items: Array<{ inventoryId: string; quantity: number }>;
      consumedAt?: Date;
    },
  ): Promise<void>;

  abstract expireReservationsForOrder(
    entityManager: EntityManager,
    orderId: string,
    options?: { expiredAt?: Date; reservationId?: string },
  ): Promise<number>;

  abstract releaseReservationsForOrder(
    entityManager: EntityManager,
    orderId: string,
    options?: { releasedAt?: Date; reservationId?: string },
  ): Promise<number>;

  abstract cleanupExpiredForOrder(
    orderId: string,
    options?: { now?: Date; reservationId?: string },
  ): Promise<number>;
}
