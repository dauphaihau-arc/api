import type { EntityManager } from '@mikro-orm/postgresql';
import { CheckoutStockReservationService } from './checkout-stock-reservation.service';
import {
  CheckoutQuoteReservationOutOfStockError,
  CheckoutQuoteReservationUnavailableError,
} from './errors/order-app.error';

describe('CheckoutStockReservationService', () => {
  it('allocates stock through the shared inventory boundary', async () => {
    const inventory = { id: 'inventory-1', stock: 5 };
    const entityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        switch (entity?.name) {
          case 'ProductInventoryEntity':
            return {
              findOne: jest.fn().mockResolvedValue(inventory),
            };
          default:
            return {};
        }
      }),
    } as unknown as EntityManager;

    const service = new CheckoutStockReservationService({} as EntityManager);

    const result = await service.allocateInventoryForOrderItems(entityManager, [{
      inventoryId: 'inventory-1',
      productId: 'product-1',
      quantity: 2,
      title: 'Product 1',
    }]);

    expect(inventory.stock).toBe(3);
    expect(result.inventoryById.get('inventory-1')).toBe(inventory);
    expect(result.inventoryEvents).toEqual([
      expect.objectContaining({
        productId: 'product-1',
        inventoryId: 'inventory-1',
        stock: 3,
      }),
    ]);
  });

  it('restores stock through the shared inventory boundary', async () => {
    const inventory = { id: 'inventory-1', stock: 2 };
    const entityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        switch (entity?.name) {
          case 'ProductInventoryEntity':
            return {
              findOne: jest.fn().mockResolvedValue(inventory),
            };
          default:
            return {};
        }
      }),
    } as unknown as EntityManager;

    const service = new CheckoutStockReservationService({} as EntityManager);

    const result = await service.restoreInventoryForOrderItems(entityManager, [{
      inventoryId: 'inventory-1',
      productId: 'product-1',
      quantity: 3,
    }]);

    expect(inventory.stock).toBe(5);
    expect(result).toEqual([
      expect.objectContaining({
        productId: 'product-1',
        inventoryId: 'inventory-1',
        stock: 5,
      }),
    ]);
  });

  it('rejects quote reservation when active holds already consume the remaining stock', async () => {
    const reservationRepository = {
      find: jest.fn().mockResolvedValue([{ quantity: 3 }]),
      create: jest.fn(),
    };
    const entityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        switch (entity?.name) {
          case 'CheckoutStockReservationEntity':
            return reservationRepository;
          case 'ProductInventoryEntity':
            return {
              findOne: jest.fn().mockResolvedValue({ id: 'inventory-1', stock: 5 }),
            };
          default:
            return {};
        }
      }),
      getReference: jest.fn((_entity: unknown, id: string) => ({ id })),
      persist: jest.fn(),
    } as unknown as EntityManager;

    const service = new CheckoutStockReservationService({} as EntityManager);

    await expect(
      service.reserveForQuote(entityManager, {
        quoteId: 'quote-1',
        cartId: 'cart-1',
        expiresAt: new Date(Date.now() + 60_000),
        items: [{ inventoryId: 'inventory-1', quantity: 3, title: 'Product 1' }],
      }),
    ).rejects.toThrow(CheckoutQuoteReservationOutOfStockError);
  });

  it('marks quote reservations consumed after validating each reserved item', async () => {
    const reservation = { quantity: 2 };
    const reservations = [
      { status: 'active', quantity: 2 },
      { status: 'active', quantity: 1 },
    ];
    const reservationRepository = {
      findOne: jest.fn()
        .mockResolvedValueOnce(reservation)
        .mockResolvedValueOnce({ quantity: 1 }),
      find: jest.fn().mockResolvedValue(reservations),
    };
    const entityManager = {
      getRepository: jest.fn(() => reservationRepository),
    } as unknown as EntityManager;

    const service = new CheckoutStockReservationService({} as EntityManager);

    await service.consumeReservationsForQuote(entityManager, {
      quoteId: 'quote-1',
      items: [
        { inventoryId: 'inventory-1', quantity: 2 },
        { inventoryId: 'inventory-2', quantity: 1 },
      ],
      consumedAt: new Date('2026-06-27T00:00:00.000Z'),
    });

    expect(reservations).toEqual([
      expect.objectContaining({
        status: 'consumed',
        consumedAt: new Date('2026-06-27T00:00:00.000Z'),
      }),
      expect.objectContaining({
        status: 'consumed',
        consumedAt: new Date('2026-06-27T00:00:00.000Z'),
      }),
    ]);
  });

  it('fails order creation when a required quote reservation is missing', async () => {
    const reservationRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const entityManager = {
      getRepository: jest.fn(() => reservationRepository),
    } as unknown as EntityManager;

    const service = new CheckoutStockReservationService({} as EntityManager);

    await expect(
      service.consumeReservationsForQuote(entityManager, {
        quoteId: 'quote-1',
        items: [{ inventoryId: 'inventory-1', quantity: 2 }],
      }),
    ).rejects.toThrow(CheckoutQuoteReservationUnavailableError);
  });

  it('expires active reservations for a quote via transactional cleanup', async () => {
    const reservations = [
      { status: 'active', expiresAt: new Date('2026-06-27T00:00:00.000Z') },
      { status: 'active', expiresAt: new Date('2026-06-27T00:00:00.000Z') },
    ];
    const reservationRepository = {
      find: jest.fn().mockResolvedValue(reservations),
    };
    const transactionalEntityManager = {
      getRepository: jest.fn(() => reservationRepository),
    };
    const entityManager = {
      transactional: jest.fn(async (work: (em: EntityManager) => Promise<number>) =>
        work(transactionalEntityManager as unknown as EntityManager)),
    } as unknown as EntityManager;

    const service = new CheckoutStockReservationService(entityManager);

    const expiredCount = await service.cleanupExpiredForQuote(
      'quote-1',
      new Date('2026-06-27T00:00:00.000Z'),
    );

    expect(expiredCount).toBe(2);
    expect(reservations).toEqual([
      expect.objectContaining({
        status: 'expired',
        releasedAt: new Date('2026-06-27T00:00:00.000Z'),
      }),
      expect.objectContaining({
        status: 'expired',
        releasedAt: new Date('2026-06-27T00:00:00.000Z'),
      }),
    ]);
  });
});
