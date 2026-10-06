import type { EntityManager } from '@mikro-orm/postgresql';
import { CheckoutQuoteReservationUnavailableError } from '../../../order/app/errors/order-app.error';
import type { InventoryReservationConfig } from '~/platform/config/inventory-reservation.config';
import type { RemoteInventoryReservationClient } from '../ports/remote-inventory-reservation.client';
import type { CheckoutStockReservationService } from './checkout-stock-reservation.service';
import { RemoteAwareCheckoutStockReservationService } from './remote-aware-checkout-stock-reservation.service';

describe('RemoteAwareCheckoutStockReservationService', () => {
  it('delegates reserveForOrder to the local reservation service when local driver is enabled', async () => {
    const localReservationService = buildLocalReservationService();
    localReservationService.reserveForOrder.mockResolvedValue(undefined);
    const { service, remoteReservationClient } = buildService({
      config: { driver: 'local', serviceBaseUrl: 'http://inventory-service:8080' },
      localReservationService,
    });
    const transactionalEntityManager = {} as EntityManager;
    const input = {
      orderId: 'order-1',
      cartId: 'cart-1',
      expiresAt: new Date('2026-08-12T05:31:19.013Z'),
      items: [{ inventoryId: 'inventory-1', quantity: 1, title: 'Product' }],
    };

    await service.reserveForOrder(transactionalEntityManager, input);

    expect(localReservationService.reserveForOrder).toHaveBeenCalledWith(
      transactionalEntityManager,
      input,
    );
    expect(remoteReservationClient.reserveOrder).not.toHaveBeenCalled();
  });

  it('reserves orders through the remote inventory service', async () => {
    const { service, remoteReservationClient } = buildService({
      config: { driver: 'remote', serviceBaseUrl: 'http://inventory-service:8080' },
    });
    remoteReservationClient.reserveOrder.mockResolvedValue({
      reservationId: 'reservation-1',
      status: 'ACTIVE',
      items: [],
    });
    const input = {
      orderId: 'order-1',
      cartId: 'cart-1',
      expiresAt: new Date('2026-08-12T05:31:19.013Z'),
      items: [{ inventoryId: 'inventory-1', quantity: 1, title: 'Product' }],
    };

    const result = await service.reserveForOrder({} as EntityManager, input);

    expect(remoteReservationClient.reserveOrder).toHaveBeenCalledWith({
      orderId: 'order-1',
      cartId: 'cart-1',
      idempotencyKey: 'order-1:reservation:v1',
      expiresAt: new Date('2026-08-12T05:31:19.013Z'),
      items: [{ inventoryId: 'inventory-1', quantity: 1, title: 'Product' }],
    });
    expect(result).toEqual({ reservationId: 'reservation-1' });
  });

  it('validates a stored remote reservation during order consumption', async () => {
    const { service, remoteReservationClient } = buildService({
      config: { driver: 'remote', serviceBaseUrl: 'http://inventory-service:8080' },
    });
    const entityManager = {} as EntityManager;
    remoteReservationClient.validateReservation.mockResolvedValue({
      valid: true,
      status: 'ACTIVE',
    });

    await service.consumeReservationsForOrder(entityManager, {
      orderId: 'order-1',
      reservationId: 'reservation-1',
      items: [{ inventoryId: 'inventory-1', quantity: 1 }],
    });

    expect(remoteReservationClient.validateReservation).toHaveBeenCalledWith({
      orderId: 'order-1',
      reservationId: 'reservation-1',
      items: [{ inventoryId: 'inventory-1', quantity: 1 }],
    });
  });

  it('rejects order consumption when the remote reservation is not active', async () => {
    const { service, remoteReservationClient } = buildService({
      config: { driver: 'remote', serviceBaseUrl: 'http://inventory-service:8080' },
    });
    const entityManager = {} as EntityManager;
    remoteReservationClient.validateReservation.mockResolvedValue({
      valid: false,
      status: 'EXPIRED',
    });

    await expect(
      service.consumeReservationsForOrder(entityManager, {
        orderId: 'order-1',
        reservationId: 'reservation-1',
        items: [{ inventoryId: 'inventory-1', quantity: 1 }],
      }),
    ).rejects.toThrow(CheckoutQuoteReservationUnavailableError);
  });

  it('rejects order consumption when no reservation id is provided', async () => {
    const { service } = buildService({
      config: { driver: 'remote', serviceBaseUrl: 'http://inventory-service:8080' },
    });
    const entityManager = {} as EntityManager;

    await expect(
      service.consumeReservationsForOrder(entityManager, {
        orderId: 'order-1',
        items: [{ inventoryId: 'inventory-1', quantity: 1 }],
      }),
    ).rejects.toThrow(CheckoutQuoteReservationUnavailableError);
  });

  it('releases a remote reservation when an order expires', async () => {
    const { service, remoteReservationClient } = buildService({
      config: { driver: 'remote', serviceBaseUrl: 'http://inventory-service:8080' },
    });
    const entityManager = {} as EntityManager;
    remoteReservationClient.releaseReservation.mockResolvedValue({
      reservationId: 'reservation-1',
      status: 'EXPIRED',
    });

    const releasedCount = await service.expireReservationsForOrder(entityManager, 'order-1', {
      reservationId: 'reservation-1',
      expiredAt: new Date('2026-08-12T05:31:19.013Z'),
    });

    expect(releasedCount).toBe(1);
    expect(remoteReservationClient.releaseReservation).toHaveBeenCalledWith({
      orderId: 'order-1',
      reservationId: 'reservation-1',
      reason: 'order_expired',
      idempotencyKey: 'order-1:release:order_expired:v1',
    });
  });

  it('releases a remote reservation when an order session expires', async () => {
    const { service, remoteReservationClient } = buildService({
      config: { driver: 'remote', serviceBaseUrl: 'http://inventory-service:8080' },
    });
    const entityManager = {} as EntityManager;
    remoteReservationClient.releaseReservation.mockResolvedValue({
      reservationId: 'reservation-1',
      status: 'RELEASED',
    });

    const releasedCount = await service.releaseReservationsForOrder(entityManager, 'order-1', {
      reservationId: 'reservation-1',
      releasedAt: new Date('2026-08-12T05:31:19.013Z'),
    });

    expect(releasedCount).toBe(1);
    expect(remoteReservationClient.releaseReservation).toHaveBeenCalledWith({
      orderId: 'order-1',
      reservationId: 'reservation-1',
      reason: 'order_session_expired',
      idempotencyKey: 'order-1:release:order_session_expired:v1',
    });
  });

  it('returns 0 when releasing an order reservation without a reservation id', async () => {
    const { service, remoteReservationClient } = buildService({
      config: { driver: 'remote', serviceBaseUrl: 'http://inventory-service:8080' },
    });
    const entityManager = {} as EntityManager;

    const releasedCount = await service.expireReservationsForOrder(entityManager, 'order-1');

    expect(releasedCount).toBe(0);
    expect(remoteReservationClient.releaseReservation).not.toHaveBeenCalled();
  });

  it('cleanupExpiredForOrder wraps expireReservationsForOrder in a transaction', async () => {
    const { service, rootEntityManager, remoteReservationClient } = buildService({
      config: { driver: 'remote', serviceBaseUrl: 'http://inventory-service:8080' },
    });
    remoteReservationClient.releaseReservation.mockResolvedValue({
      reservationId: 'reservation-1',
      status: 'EXPIRED',
    });
    const now = new Date('2026-08-12T05:31:19.013Z');

    const releasedCount = await service.cleanupExpiredForOrder('order-1', {
      now,
      reservationId: 'reservation-1',
    });

    expect(releasedCount).toBe(1);
    expect(rootEntityManager.transactional).toHaveBeenCalled();
    expect(remoteReservationClient.releaseReservation).toHaveBeenCalledWith({
      orderId: 'order-1',
      reservationId: 'reservation-1',
      reason: 'order_expired',
      idempotencyKey: 'order-1:release:order_expired:v1',
    });
  });

});

function buildService(input: {
  config: InventoryReservationConfig;
  localReservationService?: jest.Mocked<CheckoutStockReservationService>;
}) {
  const localReservationService =
    input.localReservationService ?? buildLocalReservationService();
  const remoteReservationClient = {
    reserveOrder: jest.fn(),
    validateReservation: jest.fn(),
    releaseReservation: jest.fn(),
  } as unknown as jest.Mocked<RemoteInventoryReservationClient>;
  const rootEntityManager = {
    transactional: jest.fn(async (work: (em: EntityManager) => Promise<number>) =>
      work({} as EntityManager),
    ),
  } as unknown as EntityManager;

  const service = new RemoteAwareCheckoutStockReservationService(
    input.config,
    localReservationService,
    remoteReservationClient,
    rootEntityManager,
  );

  return {
    service,
    localReservationService,
    remoteReservationClient,
    rootEntityManager,
  };
}

function buildLocalReservationService(): jest.Mocked<CheckoutStockReservationService> {
  return {
    restoreInventoryForOrderItems: jest.fn(),
    reserveForOrder: jest.fn(),
    consumeReservationsForOrder: jest.fn(),
    expireReservationsForOrder: jest.fn(),
    releaseReservationsForOrder: jest.fn(),
    cleanupExpiredForOrder: jest.fn(),
  } as unknown as jest.Mocked<CheckoutStockReservationService>;
}
