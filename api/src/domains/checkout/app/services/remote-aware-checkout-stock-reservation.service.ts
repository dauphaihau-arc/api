import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import {
  INVENTORY_RESERVATION_CONFIG,
  type InventoryReservationConfig,
} from '~/platform/config/inventory-reservation.config';
import type { ProductInventoryUpdatedSseEventPayload } from '../../../product/app/events/product-inventory-sse.event';
import {
  CheckoutQuoteReservationUnavailableError,
} from '../../../order/app/errors/order-app.error';
import { CheckoutStockReservationPort } from '../ports/checkout-stock-reservation.port';
import type { InventoryMutationOptions } from '../ports/checkout-stock-reservation.port';
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

  async restoreInventoryForOrderItems(
    entityManager: EntityManager,
    items: Array<{
      inventoryId: string;
      productId: string;
      quantity: number;
    }>,
    options: InventoryMutationOptions = {},
  ): Promise<ProductInventoryUpdatedSseEventPayload[]> {
    if (this.isLocal()) {
      return this.localReservationService.restoreInventoryForOrderItems(
        entityManager,
        items,
        options,
      );
    }

    if (!options.reservationId) {
      // No recorded purchase reservation (legacy lifecycle path). The remote
      // authority has no consumed sale to restore, so there is nothing to apply.
      return [];
    }

    await this.remoteReservationClient.restoreSale({
      reservationId: options.reservationId,
      reason: options.cause ?? 'order_canceled',
      idempotencyKey: options.commandId ?? `${options.reservationId}:restore-sale`,
      items: items.map((item) => ({
        inventoryId: item.inventoryId,
        quantity: item.quantity,
      })),
    });

    return [];
  }

  async reserveForOrder(
    transactionalEntityManager: EntityManager,
    input: {
      orderId: string;
      cartId: string;
      expiresAt: Date;
      items: Array<{
        inventoryId: string; quantity: number; title: string
      }>;
    },
  ): Promise<{ reservationId?: string } | void> {
    if (this.isLocal()) {
      return this.localReservationService.reserveForOrder(
        transactionalEntityManager,
        input,
      );
    }

    const result = await this.remoteReservationClient.reserveOrder({
      orderId: input.orderId,
      cartId: input.cartId,
      idempotencyKey: buildReservationIdempotencyKey(input.orderId),
      expiresAt: input.expiresAt,
      items: input.items,
    });

    return { reservationId: result.reservationId };
  }

  async consumeReservationsForOrder(
    entityManager: EntityManager,
    input: {
      orderId: string;
      reservationId?: string;
      items: Array<{ inventoryId: string; quantity: number }>;
      consumedAt?: Date;
    },
  ): Promise<void> {
    if (this.isLocal()) {
      return this.localReservationService.consumeReservationsForOrder(
        entityManager,
        input,
      );
    }

    // The inventory-service consumes the hold to SOLD when it processes the
    // Order's `order.created` event. Before the Order is marked paid, confirm
    // the hold is still active so a released or expired reservation fails the
    // commitment instead of overselling.
    if (!input.reservationId) {
      throw new CheckoutQuoteReservationUnavailableError();
    }

    const result = await this.remoteReservationClient.validateReservation({
      orderId: input.orderId,
      reservationId: input.reservationId,
      items: input.items,
    });

    if (!result.valid || result.status !== 'ACTIVE') {
      throw new CheckoutQuoteReservationUnavailableError();
    }
  }

  async expireReservationsForOrder(
    entityManager: EntityManager,
    orderId: string,
    options?: { expiredAt?: Date; reservationId?: string },
  ): Promise<number> {
    if (this.isLocal()) {
      return this.localReservationService.expireReservationsForOrder(
        entityManager,
        orderId,
        options,
      );
    }

    if (!options?.reservationId) {
      return 0;
    }

    await this.remoteReservationClient.releaseReservation({
      orderId,
      reservationId: options.reservationId,
      reason: 'order_expired',
      idempotencyKey: buildReleaseIdempotencyKey(orderId, 'order_expired'),
    });

    return 1;
  }

  async releaseReservationsForOrder(
    entityManager: EntityManager,
    orderId: string,
    options?: { releasedAt?: Date; reservationId?: string },
  ): Promise<number> {
    if (this.isLocal()) {
      return this.localReservationService.releaseReservationsForOrder(
        entityManager,
        orderId,
        options,
      );
    }

    if (!options?.reservationId) {
      return 0;
    }

    await this.remoteReservationClient.releaseReservation({
      orderId,
      reservationId: options.reservationId,
      reason: 'order_session_expired',
      idempotencyKey: buildReleaseIdempotencyKey(orderId, 'order_session_expired'),
    });

    return 1;
  }

  async cleanupExpiredForOrder(
    orderId: string,
    options?: { now?: Date; reservationId?: string },
  ): Promise<number> {
    if (this.isLocal()) {
      return this.localReservationService.cleanupExpiredForOrder(orderId, options);
    }

    return this.entityManager.transactional(async (entityManager) =>
      this.expireReservationsForOrder(entityManager, orderId, {
        expiredAt: options?.now,
        reservationId: options?.reservationId,
      }));
  }

  private isLocal(): boolean {
    return this.inventoryReservationConfig.driver === 'local';
  }
}

function buildReservationIdempotencyKey(quoteId: string): string {
  return `${quoteId}:reservation:v1`;
}

function buildReleaseIdempotencyKey(quoteId: string, reason: string): string {
  return `${quoteId}:release:${reason}:v1`;
}
