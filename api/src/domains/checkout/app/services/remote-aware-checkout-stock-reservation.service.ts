import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  INVENTORY_RESERVATION_CONFIG,
  type InventoryReservationConfig,
} from '~/platform/config/inventory-reservation.config';
import type { ProductInventoryUpdatedSseEventPayload } from '../../../product/app/events/product-inventory-sse.event';
import { ProductInventoryEntity } from '../../../product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import {
  CheckoutQuoteReservationUnavailableError,
} from '../../../order/app/errors/order-app.error';
import { CheckoutQuoteEntity } from '../../infra/persistence/entities/checkout-quote.entity';
import { CheckoutStockReservationPort } from '../ports/checkout-stock-reservation.port';
import { RemoteInventoryReservationClient } from '../ports/remote-inventory-reservation.client';
import { CheckoutStockReservationService } from './checkout-stock-reservation.service';

@Injectable()
export class RemoteAwareCheckoutStockReservationService
implements CheckoutStockReservationPort {
  constructor(
    @Inject(INVENTORY_RESERVATION_CONFIG)
    private readonly inventoryReservationConfig: InventoryReservationConfig,
    private readonly localReservationService: CheckoutStockReservationService,
    private readonly remoteReservationClient: RemoteInventoryReservationClient,
    private readonly entityManager: EntityManager,
  ) {}

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
    inventoryEvents: ProductInventoryUpdatedSseEventPayload[];
  }> {
    if (this.isLocal()) {
      return this.localReservationService.allocateInventoryForOrderItems(
        entityManager,
        items,
      );
    }

    return {
      inventoryById: await this.loadInventoryById(entityManager, items),
      inventoryEvents: [],
    };
  }

  async restoreInventoryForOrderItems(
    entityManager: EntityManager,
    items: Array<{
      inventoryId: string;
      productId: string;
      quantity: number;
    }>,
  ): Promise<ProductInventoryUpdatedSseEventPayload[]> {
    if (this.isLocal()) {
      return this.localReservationService.restoreInventoryForOrderItems(
        entityManager,
        items,
      );
    }

    return [];
  }

  async reserveForQuote(
    transactionalEntityManager: EntityManager,
    input: {
      quoteId: string;
      cartId: string;
      expiresAt: Date;
      items: Array<{ inventoryId: string; quantity: number; title: string }>;
    },
  ): Promise<{ reservationId?: string } | void> {
    if (this.isLocal()) {
      return this.localReservationService.reserveForQuote(
        transactionalEntityManager,
        input,
      );
    }

    const result = await this.remoteReservationClient.reserveQuote({
      quoteId: input.quoteId,
      cartId: input.cartId,
      idempotencyKey: buildReservationIdempotencyKey(input.quoteId),
      expiresAt: input.expiresAt,
      items: input.items,
    });

    return { reservationId: result.reservationId };
  }

  async consumeReservationsForQuote(
    entityManager: EntityManager,
    input: {
      quoteId: string;
      items: Array<{ inventoryId: string; quantity: number }>;
      consumedAt?: Date;
    },
  ): Promise<void> {
    if (this.isLocal()) {
      return this.localReservationService.consumeReservationsForQuote(
        entityManager,
        input,
      );
    }

    const quote = await this.loadQuote(entityManager, input.quoteId);
    if (!quote?.reservationId) {
      throw new CheckoutQuoteReservationUnavailableError();
    }

    const result = await this.remoteReservationClient.validateReservation({
      quoteId: input.quoteId,
      reservationId: quote.reservationId,
      items: input.items,
    });

    if (!result.valid || result.status !== 'ACTIVE') {
      throw new CheckoutQuoteReservationUnavailableError();
    }
  }

  async expireReservationsForQuote(
    entityManager: EntityManager,
    quoteId: string,
    expiredAt?: Date,
  ): Promise<number> {
    if (this.isLocal()) {
      return this.localReservationService.expireReservationsForQuote(
        entityManager,
        quoteId,
        expiredAt,
      );
    }

    const quote = await this.loadQuote(entityManager, quoteId);
    if (!quote?.reservationId) {
      return 0;
    }

    await this.remoteReservationClient.releaseReservation({
      quoteId,
      reservationId: quote.reservationId,
      reason: 'quote_expired',
      idempotencyKey: buildReleaseIdempotencyKey(quoteId, 'quote_expired'),
    });

    return 1;
  }

  async cleanupExpiredForQuote(quoteId: string, now = new Date()): Promise<number> {
    if (this.isLocal()) {
      return this.localReservationService.cleanupExpiredForQuote(quoteId, now);
    }

    return this.entityManager.transactional(async (entityManager) =>
      this.expireReservationsForQuote(entityManager, quoteId, now));
  }

  private isLocal(): boolean {
    return this.inventoryReservationConfig.driver === 'local';
  }

  private async loadInventoryById(
    entityManager: EntityManager,
    items: Array<{ inventoryId: string }>,
  ): Promise<Map<string, ProductInventoryEntity>> {
    const inventoryById = new Map<string, ProductInventoryEntity>();

    for (const item of sortItemsByInventoryId(items)) {
      const inventory = await entityManager.getRepository(ProductInventoryEntity).findOne({
        id: item.inventoryId,
      });

      if (!inventory) {
        throw new NotFoundException('Inventory not found');
      }

      inventoryById.set(inventory.id, inventory);
    }

    return inventoryById;
  }

  private async loadQuote(
    entityManager: EntityManager,
    quoteId: string,
  ): Promise<CheckoutQuoteEntity | null> {
    return entityManager.getRepository(CheckoutQuoteEntity).findOne({ id: quoteId });
  }
}

function buildReservationIdempotencyKey(quoteId: string): string {
  return `${quoteId}:reservation:v1`;
}

function buildReleaseIdempotencyKey(quoteId: string, reason: string): string {
  return `${quoteId}:release:${reason}:v1`;
}

function sortItemsByInventoryId<T extends { inventoryId: string }>(items: T[]): T[] {
  return items.slice().sort((left, right) => left.inventoryId.localeCompare(right.inventoryId));
}
