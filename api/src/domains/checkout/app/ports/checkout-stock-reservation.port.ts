import type { EntityManager } from '@mikro-orm/postgresql';
import type { ProductInventoryUpdatedSseEventPayload } from '../../../product/app/events/product-inventory-sse.event';
import type { ProductInventoryEntity } from '../../../product/infra/persistence/mikro-orm/entities/product-inventory.entity';

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
  abstract allocateInventoryForOrderItems(
    entityManager: EntityManager,
    items: Array<{
      inventoryId: string;
      productId: string;
      quantity: number;
      title: string;
    }>,
    options?: InventoryMutationOptions,
  ): Promise<{
    inventoryById: Map<string, ProductInventoryEntity>;
    inventoryEvents: ProductInventoryUpdatedSseEventPayload[];
  }>;

  abstract restoreInventoryForOrderItems(
    entityManager: EntityManager,
    items: Array<{
      inventoryId: string;
      productId: string;
      quantity: number;
    }>,
    options?: InventoryMutationOptions,
  ): Promise<ProductInventoryUpdatedSseEventPayload[]>;

  abstract reserveForQuote(
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
  ): Promise<{ reservationId?: string } | void>;

  abstract consumeReservationsForQuote(
    entityManager: EntityManager,
    input: {
      quoteId: string;
      items: Array<{ inventoryId: string; quantity: number }>;
      consumedAt?: Date;
    },
  ): Promise<void>;

  abstract expireReservationsForQuote(
    entityManager: EntityManager,
    quoteId: string,
    expiredAt?: Date,
  ): Promise<number>;

  abstract releaseReservationsForQuote(
    entityManager: EntityManager,
    quoteId: string,
    releasedAt?: Date,
  ): Promise<number>;

  abstract cleanupExpiredForQuote(quoteId: string, now?: Date): Promise<number>;
}
