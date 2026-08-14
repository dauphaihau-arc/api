import type { EntityManager } from '@mikro-orm/postgresql';
import { CheckoutQuoteReservationUnavailableError } from '../../../order/app/errors/order-app.error';
import type { ProductInventoryEntity } from '../../../product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import type { InventoryReservationConfig } from '~/platform/config/inventory-reservation.config';
import type { CheckoutInventoryQueryRepository } from '../ports/checkout-inventory-query.repository';
import type { CheckoutQuoteRepository } from '../ports/checkout-quote.repository';
import type { RemoteInventoryReservationClient } from '../ports/remote-inventory-reservation.client';
import type { CheckoutStockReservationService } from './checkout-stock-reservation.service';
import { RemoteAwareCheckoutStockReservationService } from './remote-aware-checkout-stock-reservation.service';

describe('RemoteAwareCheckoutStockReservationService', () => {
  it('delegates to the local reservation service when local driver is enabled', async () => {
    const localReservationService = buildLocalReservationService();
    localReservationService.reserveForQuote.mockResolvedValue(undefined);
    const { service, remoteReservationClient } = buildService({
      config: { driver: 'local', serviceBaseUrl: 'http://inventory-service:8080' },
      localReservationService,
    });

    await service.reserveForQuote({} as EntityManager, {
      quoteId: 'quote-1',
      cartId: 'cart-1',
      expiresAt: new Date('2026-08-12T05:31:19.013Z'),
      items: [{ inventoryId: 'inventory-1', quantity: 1, title: 'Product' }],
    });

    expect(localReservationService.reserveForQuote).toHaveBeenCalled();
    expect(remoteReservationClient.reserveQuote).not.toHaveBeenCalled();
  });

  it('reserves quotes through the remote inventory service', async () => {
    const { service, remoteReservationClient } = buildService({
      config: { driver: 'remote', serviceBaseUrl: 'http://inventory-service:8080' },
    });
    remoteReservationClient.reserveQuote.mockResolvedValue({
      reservationId: 'reservation-1',
      status: 'ACTIVE',
      items: [],
    });

    const result = await service.reserveForQuote({} as EntityManager, {
      quoteId: 'quote-1',
      cartId: 'cart-1',
      expiresAt: new Date('2026-08-12T05:31:19.013Z'),
      items: [{ inventoryId: 'inventory-1', quantity: 1, title: 'Product' }],
    });

    expect(remoteReservationClient.reserveQuote).toHaveBeenCalledWith({
      quoteId: 'quote-1',
      cartId: 'cart-1',
      idempotencyKey: 'quote-1:reservation:v1',
      expiresAt: new Date('2026-08-12T05:31:19.013Z'),
      items: [{ inventoryId: 'inventory-1', quantity: 1, title: 'Product' }],
    });
    expect(result).toEqual({ reservationId: 'reservation-1' });
  });

  it('validates a stored remote reservation during quote consumption', async () => {
    const { service, remoteReservationClient, checkoutQuoteRepository } = buildService({
      config: { driver: 'remote', serviceBaseUrl: 'http://inventory-service:8080' },
      quote: { id: 'quote-1', reservationId: 'reservation-1' },
    });
    const entityManager = {} as EntityManager;
    remoteReservationClient.validateReservation.mockResolvedValue({
      valid: true,
      status: 'ACTIVE',
    });

    await service.consumeReservationsForQuote(entityManager, {
      quoteId: 'quote-1',
      items: [{ inventoryId: 'inventory-1', quantity: 1 }],
    });

    expect(remoteReservationClient.validateReservation).toHaveBeenCalledWith({
      quoteId: 'quote-1',
      reservationId: 'reservation-1',
      items: [{ inventoryId: 'inventory-1', quantity: 1 }],
    });
    expect(checkoutQuoteRepository.findById).toHaveBeenCalledWith(
      'quote-1',
      { entityManager },
    );
  });

  it('rejects quote consumption when the remote reservation is not active', async () => {
    const { service, remoteReservationClient } = buildService({
      config: { driver: 'remote', serviceBaseUrl: 'http://inventory-service:8080' },
      quote: { id: 'quote-1', reservationId: 'reservation-1' },
    });
    const entityManager = {} as EntityManager;
    remoteReservationClient.validateReservation.mockResolvedValue({
      valid: false,
      status: 'EXPIRED',
    });

    await expect(service.consumeReservationsForQuote(entityManager, {
      quoteId: 'quote-1',
      items: [{ inventoryId: 'inventory-1', quantity: 1 }],
    })).rejects.toThrow(CheckoutQuoteReservationUnavailableError);
  });

  it('loads inventory references without mutating stock in remote mode', async () => {
    const inventory = { id: 'inventory-1', stock: 5 };
    const { service, checkoutInventoryQueryRepository } = buildService({
      config: { driver: 'remote', serviceBaseUrl: 'http://inventory-service:8080' },
      inventoryById: new Map([['inventory-1', inventory as ProductInventoryEntity]]),
    });
    const entityManager = {} as EntityManager;

    const result = await service.allocateInventoryForOrderItems(entityManager, [{
      inventoryId: 'inventory-1',
      productId: 'product-1',
      quantity: 2,
      title: 'Product',
    }]);

    expect(inventory.stock).toBe(5);
    expect(result.inventoryById.get('inventory-1')).toBe(inventory);
    expect(result.inventoryEvents).toEqual([]);
    expect(checkoutInventoryQueryRepository.findByIds).toHaveBeenCalledWith(
      ['inventory-1'],
      { entityManager },
    );
  });

  it('releases a remote reservation when a quote expires', async () => {
    const { service, remoteReservationClient } = buildService({
      config: { driver: 'remote', serviceBaseUrl: 'http://inventory-service:8080' },
      quote: { id: 'quote-1', reservationId: 'reservation-1' },
    });
    const entityManager = {} as EntityManager;
    remoteReservationClient.releaseReservation.mockResolvedValue({
      reservationId: 'reservation-1',
      status: 'RELEASED',
    });

    const releasedCount = await service.expireReservationsForQuote(
      entityManager,
      'quote-1',
      new Date('2026-08-12T05:31:19.013Z'),
    );

    expect(releasedCount).toBe(1);
    expect(remoteReservationClient.releaseReservation).toHaveBeenCalledWith({
      quoteId: 'quote-1',
      reservationId: 'reservation-1',
      reason: 'quote_expired',
      idempotencyKey: 'quote-1:release:quote_expired:v1',
    });
  });
});

function buildService(input: {
  config: InventoryReservationConfig;
  localReservationService?: jest.Mocked<CheckoutStockReservationService>;
  quote?: { id: string; reservationId?: string };
  inventoryById?: Map<string, ProductInventoryEntity>;
}) {
  const localReservationService =
    input.localReservationService ?? buildLocalReservationService();
  const remoteReservationClient = {
    reserveQuote: jest.fn(),
    validateReservation: jest.fn(),
    releaseReservation: jest.fn(),
  } as unknown as jest.Mocked<RemoteInventoryReservationClient>;
  const rootEntityManager = {
    transactional: jest.fn(async (work: (em: EntityManager) => Promise<number>) =>
      work({} as EntityManager)),
  } as unknown as EntityManager;
  const checkoutQuoteRepository = {
    findById: jest.fn().mockResolvedValue(input.quote ?? null),
  } as unknown as jest.Mocked<CheckoutQuoteRepository>;
  const checkoutInventoryQueryRepository = {
    findByIds: jest.fn().mockResolvedValue(input.inventoryById ?? new Map()),
  } as unknown as jest.Mocked<CheckoutInventoryQueryRepository>;

  const service = new RemoteAwareCheckoutStockReservationService(
    input.config,
    localReservationService,
    remoteReservationClient,
    rootEntityManager,
    checkoutQuoteRepository,
    checkoutInventoryQueryRepository,
  );

  return {
    service,
    localReservationService,
    remoteReservationClient,
    checkoutQuoteRepository,
    checkoutInventoryQueryRepository,
  };
}

function buildLocalReservationService(): jest.Mocked<CheckoutStockReservationService> {
  return {
    allocateInventoryForOrderItems: jest.fn(),
    restoreInventoryForOrderItems: jest.fn(),
    reserveForQuote: jest.fn(),
    consumeReservationsForQuote: jest.fn(),
    expireReservationsForQuote: jest.fn(),
    cleanupExpiredForQuote: jest.fn(),
  } as unknown as jest.Mocked<CheckoutStockReservationService>;
}
