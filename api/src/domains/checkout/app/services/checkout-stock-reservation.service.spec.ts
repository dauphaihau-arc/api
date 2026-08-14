import type { EntityManager } from '@mikro-orm/postgresql';
import { CheckoutStockReservationService } from './checkout-stock-reservation.service';
import {
  CheckoutQuoteReservationOutOfStockError,
  CheckoutQuoteReservationUnavailableError,
} from '../../../order/app/errors/order-app.error';

describe('CheckoutStockReservationService', () => {
  it('allocates stock through the shared inventory boundary', async () => {
    const inventory = { id: 'inventory-1', stock: 5 };
    const inventoryRepository = {
      find: jest.fn().mockResolvedValue([inventory]),
    };
    const entityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        switch (entity?.name) {
          case 'ProductInventoryEntity':
            return inventoryRepository;
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
    expect(inventoryRepository.find).toHaveBeenCalledWith(
      { id: { $in: ['inventory-1'] } },
      expect.objectContaining({
        lockMode: expect.anything(),
        orderBy: { id: 'asc' },
      }),
    );
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
    const inventoryRepository = {
      find: jest.fn().mockResolvedValue([inventory]),
    };
    const entityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        switch (entity?.name) {
          case 'ProductInventoryEntity':
            return inventoryRepository;
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
    expect(inventoryRepository.find).toHaveBeenCalledWith(
      { id: { $in: ['inventory-1'] } },
      expect.objectContaining({
        lockMode: expect.anything(),
        orderBy: { id: 'asc' },
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        productId: 'product-1',
        inventoryId: 'inventory-1',
        stock: 5,
      }),
    ]);
  });

  it('decrements stock when reserving a quote', async () => {
    const execute = jest.fn().mockResolvedValue([{ reserved_count: '1' }]);
    const entityManager = {
      getRepository: jest.fn(),
      execute,
      persist: jest.fn(),
      flush: jest.fn().mockResolvedValue(undefined),
    } as unknown as EntityManager;

    const service = new CheckoutStockReservationService({} as EntityManager);

    await service.reserveForQuote(entityManager, {
      quoteId: 'quote-1',
      cartId: 'cart-1',
      expiresAt: new Date(Date.now() + 60_000),
      items: [{ inventoryId: 'inventory-1', quantity: 3, title: 'Product 1' }],
    });

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('updated_inventory as'),
      ['inventory-1', 3, 'quote-1', 'cart-1', expect.any(Date)],
    );
    expect(entityManager.flush).toHaveBeenCalledTimes(1);
    expect(entityManager.getRepository).not.toHaveBeenCalled();
    expect(entityManager.persist).not.toHaveBeenCalled();
  });

  it('rejects quote reservation when available stock is below the requested quantity', async () => {
    const execute = jest.fn().mockResolvedValue([{ reserved_count: '0' }]);
    const entityManager = {
      getRepository: jest.fn(),
      execute,
      persist: jest.fn(),
      flush: jest.fn().mockResolvedValue(undefined),
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
    expect(entityManager.flush).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('updated_inventory as'),
      ['inventory-1', 3, 'quote-1', 'cart-1', expect.any(Date)],
    );
    expect(entityManager.persist).not.toHaveBeenCalled();
  });

  it('aggregates duplicate inventory rows before reserving a quote', async () => {
    const execute = jest.fn().mockResolvedValue([{ reserved_count: '1' }]);
    const entityManager = {
      getRepository: jest.fn(),
      execute,
      persist: jest.fn(),
      flush: jest.fn().mockResolvedValue(undefined),
    } as unknown as EntityManager;

    const service = new CheckoutStockReservationService({} as EntityManager);

    await service.reserveForQuote(entityManager, {
      quoteId: 'quote-1',
      cartId: 'cart-1',
      expiresAt: new Date(Date.now() + 60_000),
      items: [
        { inventoryId: 'inventory-1', quantity: 2, title: 'Product 1' },
        { inventoryId: 'inventory-1', quantity: 1, title: 'Product 1' },
      ],
    });

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('values (?::uuid, ?::int)'),
      ['inventory-1', 3, 'quote-1', 'cart-1', expect.any(Date)],
    );
  });

  it('marks quote reservations consumed after validating each reserved item', async () => {
    const reservations = [
      { inventory: { id: 'inventory-1' }, status: 'active', quantity: 2 },
      { inventory: { id: 'inventory-2' }, status: 'active', quantity: 1 },
    ];
    const reservationRepository = {
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

    expect(reservationRepository.find).toHaveBeenCalledTimes(1);
    expect(reservationRepository.find).toHaveBeenCalledWith(
      {
        quote: 'quote-1',
        inventory: { $in: ['inventory-1', 'inventory-2'] },
        status: 'active',
        expiresAt: { $gt: new Date('2026-06-27T00:00:00.000Z') },
      },
      expect.objectContaining({
        lockMode: expect.anything(),
        orderBy: { inventory: 'asc' },
      }),
    );
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
      find: jest.fn().mockResolvedValue([]),
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
    const execute = jest.fn().mockResolvedValue([{ expired_count: '2' }]);
    const transactionalEntityManager = {
      execute,
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
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('with expired as'),
      [
        'expired',
        new Date('2026-06-27T00:00:00.000Z'),
        'quote-1',
        'active',
        new Date('2026-06-27T00:00:00.000Z'),
      ],
    );
  });
});
