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
import { CheckoutQuoteEntity } from '../../infra/persistence/entities/checkout-quote.entity';

@Injectable()
export class CheckoutStockReservationService {
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
    const inventoryById = new Map<string, ProductInventoryEntity>();
    const inventoryEvents: Array<ReturnType<typeof buildProductInventoryUpdatedSseEvent>> = [];

    for (const item of this.sortItemsByInventoryId(items)) {
      const inventory = await this.lockInventory(entityManager, item.inventoryId);

      if (!inventory) {
        throw new NotFoundException('Inventory not found');
      }

      if (inventory.stock < item.quantity) {
        throw new BadRequestException(`Insufficient stock for ${item.title}`);
      }

      inventory.stock -= item.quantity;
      inventoryById.set(inventory.id, inventory);
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
    const inventoryEvents: Array<ReturnType<typeof buildProductInventoryUpdatedSseEvent>> = [];

    for (const item of this.sortItemsByInventoryId(items)) {
      const inventory = await this.lockInventory(entityManager, item.inventoryId);

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
    const reservationRepository = transactionalEntityManager.getRepository(CheckoutStockReservationEntity);
    const quoteReference = transactionalEntityManager.getReference(CheckoutQuoteEntity, input.quoteId);
    const now = new Date();

    for (const item of this.sortItemsByInventoryId(input.items)) {
      const inventory = await this.lockInventory(transactionalEntityManager, item.inventoryId);

      if (!inventory) {
        throw new CheckoutQuoteReservationOutOfStockError(item.title);
      }

      const activeReservations = await reservationRepository.find({
        inventory: item.inventoryId,
        status: CheckoutStockReservationStatus.ACTIVE,
        expiresAt: { $gt: now },
      });
      const reservedQuantity = activeReservations.reduce(
        (total, reservation) => total + reservation.quantity,
        0,
      );

      if (inventory.stock - reservedQuantity < item.quantity) {
        throw new CheckoutQuoteReservationOutOfStockError(item.title);
      }

      const reservation = reservationRepository.create({
        quote: quoteReference,
        inventory,
        cartId: input.cartId,
        quantity: item.quantity,
        status: CheckoutStockReservationStatus.ACTIVE,
        expiresAt: input.expiresAt,
      });
      transactionalEntityManager.persist(reservation);
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

    for (const item of this.sortItemsByInventoryId(input.items)) {
      const reservation = await reservationRepository.findOne(
        {
          quote: input.quoteId,
          inventory: item.inventoryId,
          status: CheckoutStockReservationStatus.ACTIVE,
          expiresAt: { $gt: now },
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );

      if (!reservation || reservation.quantity !== item.quantity) {
        throw new CheckoutQuoteReservationUnavailableError();
      }
    }

    await this.transitionReservations(
      entityManager,
      {
        quote: input.quoteId,
        status: CheckoutStockReservationStatus.ACTIVE,
        expiresAt: { $gt: now },
      },
      CheckoutStockReservationStatus.CONSUMED,
      now,
    );
  }

  async expireReservationsForQuote(
    entityManager: EntityManager,
    quoteId: string,
    expiredAt?: Date,
  ): Promise<number> {
    return this.transitionReservations(
      entityManager,
      {
        quote: quoteId,
        status: CheckoutStockReservationStatus.ACTIVE,
        expiresAt: { $lte: expiredAt ?? new Date() },
      },
      CheckoutStockReservationStatus.EXPIRED,
      expiredAt ?? new Date(),
    );
  }

  async cleanupExpiredForQuote(quoteId: string, now = new Date()): Promise<number> {
    return this.entityManager.transactional(async (entityManager) =>
      this.expireReservationsForQuote(entityManager, quoteId, now));
  }

  private async transitionReservations(
    entityManager: EntityManager,
    where: Record<string, unknown>,
    nextStatus: CheckoutStockReservationStatus,
    transitionedAt: Date,
  ): Promise<number> {
    const reservations = await entityManager.getRepository(CheckoutStockReservationEntity).find(where);

    for (const reservation of reservations) {
      reservation.status = nextStatus;
      if (nextStatus === CheckoutStockReservationStatus.CONSUMED) {
        reservation.consumedAt = transitionedAt;
      }
      else {
        reservation.releasedAt = transitionedAt;
      }
    }

    return reservations.length;
  }

  private async lockInventory(
    entityManager: EntityManager,
    inventoryId: string,
  ): Promise<ProductInventoryEntity | null> {
    return entityManager.getRepository(ProductInventoryEntity).findOne(
      { id: inventoryId },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
  }

  private sortItemsByInventoryId<T extends { inventoryId: string }>(items: T[]): T[] {
    return items.slice().sort((left, right) => left.inventoryId.localeCompare(right.inventoryId));
  }
}
