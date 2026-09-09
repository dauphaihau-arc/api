import type { EntityManager } from '@mikro-orm/postgresql';
import { CheckoutStockReservationService } from './checkout-stock-reservation.service';
import {
  CheckoutQuoteReservationOutOfStockError,
  CheckoutQuoteReservationUnavailableError,
} from '../../../order/app/errors/order-app.error';

describe('CheckoutStockReservationService', () => {
  it('allocates immediate order items from On-hand Quantity and leaves reservations unchanged', async () => {
    const inventory = {
      id: 'inventory-1',
      stock: 5,
      onHandQuantity: 5,
      reservedQuantity: 1,
      availableQuantity: 4,
    };
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

    expect(inventory.onHandQuantity).toBe(3);
    expect(inventory.reservedQuantity).toBe(1);
    expect(inventory.stock).toBe(2);
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
        status: 'low_stock',
      }),
    ]);
  });

  it('records physical corrections as On-hand Quantity without changing Reserved Quantity', async () => {
    const inventory = {
      id: 'inventory-1',
      stock: 2,
      onHandQuantity: 2,
      reservedQuantity: 1,
    };
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

    expect(inventory.onHandQuantity).toBe(5);
    expect(inventory.reservedQuantity).toBe(1);
    expect(inventory.stock).toBe(4);
    expect(result).toEqual([
      expect.objectContaining({
        productId: 'product-1',
        inventoryId: 'inventory-1',
        status: 'in_stock',
      }),
    ]);
  });

  it('reserves a quote by increasing Reserved Quantity and deriving Available Quantity', async () => {
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

    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain('reserved_quantity = product_inventory.reserved_quantity + requested.quantity');
    expect(sql).toContain('product_inventory.on_hand_quantity - product_inventory.reserved_quantity');
    expect(sql).toContain('inventory_movements');
    expect(sql).not.toContain('set stock = product_inventory.stock - requested.quantity');
    expect(params).toEqual(['inventory-1', 3, 'quote-1', 'cart-1', expect.any(Date), 'quote-1:reserve']);
    expect(entityManager.flush).toHaveBeenCalledTimes(1);
    expect(entityManager.getRepository).not.toHaveBeenCalled();
    expect(entityManager.persist).not.toHaveBeenCalled();
  });

  it('rejects quote reservation when Available Quantity is below the requested quantity', async () => {
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
      ['inventory-1', 3, 'quote-1', 'cart-1', expect.any(Date), 'quote-1:reserve'],
    );
  });

  it('atomically consumes complete reservation quantities from both On-hand and Reserved balances', async () => {
    const execute = jest.fn().mockResolvedValue([{ consumed_count: '2' }]);
    const entityManager = {
      execute,
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

    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain('on_hand_quantity = product_inventory.on_hand_quantity - reserved.quantity');
    expect(sql).toContain('reserved_quantity = product_inventory.reserved_quantity - reserved.quantity');
    expect(sql).toContain('inventory_movements');
    expect(sql).toContain('not exists');
    expect(params).toEqual([
      'inventory-1',
      2,
      'inventory-2',
      1,
      'quote-1',
      new Date('2026-06-27T00:00:00.000Z'),
      new Date('2026-06-27T00:00:00.000Z'),
      'quote-1:consume',
    ]);
  });

  it('fails consumption without partial balance changes when shortage prevents the complete reservation from being consumed', async () => {
    const execute = jest.fn().mockResolvedValue([{ consumed_count: '0' }]);
    const entityManager = {
      execute,
    } as unknown as EntityManager;

    const service = new CheckoutStockReservationService({} as EntityManager);

    await expect(
      service.consumeReservationsForQuote(entityManager, {
        quoteId: 'quote-1',
        items: [{ inventoryId: 'inventory-1', quantity: 2 }],
        consumedAt: new Date('2026-06-27T00:00:00.000Z'),
      }),
    ).rejects.toThrow(CheckoutQuoteReservationUnavailableError);

    const [sql] = execute.mock.calls[0];
    expect(sql).toContain('not exists');
    expect(sql).toContain('on_hand_quantity < quantity');
  });

  it('expires active reservations by releasing Reserved Quantity, not by increasing On-hand Quantity', async () => {
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
    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain('reserved_quantity = greatest(product_inventory.reserved_quantity - restored.quantity, 0)');
    expect(sql).toContain('inventory_movements');
    expect(sql).not.toContain('stock = product_inventory.stock + restored.quantity');
    expect(params).toEqual([
      'expired',
      new Date('2026-06-27T00:00:00.000Z'),
      'quote-1',
      'active',
      new Date('2026-06-27T00:00:00.000Z'),
      'quote-1:expire',
    ]);
  });
});
