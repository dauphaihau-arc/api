import { HttpRemoteInventoryReservationClient } from './http-remote-inventory-reservation.client';
import type { InventoryReservationConfig } from '~/platform/config/inventory-reservation.config';

describe('HttpRemoteInventoryReservationClient', () => {
  const remoteConfig: InventoryReservationConfig = {
    driver: 'remote',
    serviceBaseUrl: 'http://inventory-service:8080',
  };

  it('rejects calls when the remote driver is not enabled', async () => {
    const client = new HttpRemoteInventoryReservationClient({
      driver: 'local',
      serviceBaseUrl: 'http://inventory-service:8080',
    }, jest.fn());

    await expect(client.reserveQuote({
      quoteId: 'quote-1',
      cartId: 'cart-1',
      idempotencyKey: 'quote-1:reservation:v1',
      expiresAt: new Date('2026-08-12T05:31:19.013Z'),
      items: [{ inventoryId: 'inventory-1', quantity: 1, title: 'Product' }],
    })).rejects.toThrow('Remote inventory reservation client called while INVENTORY_RESERVATION_DRIVER is local');
  });

  it('posts reserve requests to the inventory service', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse({
      reservationId: 'reservation-1',
      status: 'ACTIVE',
      items: [{
        inventoryId: 'inventory-1',
        quantity: 1,
        availableAfterReservation: 9,
      }],
    }));
    const client = new HttpRemoteInventoryReservationClient(remoteConfig, fetchFn);

    const result = await client.reserveQuote({
      quoteId: 'quote-1',
      cartId: 'cart-1',
      idempotencyKey: 'quote-1:reservation:v1',
      expiresAt: new Date('2026-08-12T05:31:19.013Z'),
      items: [{ inventoryId: 'inventory-1', quantity: 1, title: 'Product' }],
    });

    expect(fetchFn).toHaveBeenCalledWith(
      'http://inventory-service:8080/inventory/reservations/quote',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteId: 'quote-1',
          cartId: 'cart-1',
          idempotencyKey: 'quote-1:reservation:v1',
          expiresAt: '2026-08-12T05:31:19.013Z',
          items: [{ inventoryId: 'inventory-1', quantity: 1, title: 'Product' }],
        }),
      },
    );
    expect(result.reservationId).toBe('reservation-1');
  });

  it('posts validate requests to the inventory service', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse({
      valid: true,
      status: 'ACTIVE',
    }));
    const client = new HttpRemoteInventoryReservationClient(remoteConfig, fetchFn);

    await expect(client.validateReservation({
      quoteId: 'quote-1',
      reservationId: 'reservation-1',
      items: [{ inventoryId: 'inventory-1', quantity: 1 }],
    })).resolves.toEqual({
      valid: true,
      status: 'ACTIVE',
    });

    expect(fetchFn).toHaveBeenCalledWith(
      'http://inventory-service:8080/inventory/reservations/validate',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('posts release requests to the inventory service', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse({
      reservationId: 'reservation-1',
      status: 'RELEASED',
    }));
    const client = new HttpRemoteInventoryReservationClient(remoteConfig, fetchFn);

    await expect(client.releaseReservation({
      quoteId: 'quote-1',
      reservationId: 'reservation-1',
      reason: 'manual_release',
      idempotencyKey: 'quote-1:release:v1',
    })).resolves.toEqual({
      reservationId: 'reservation-1',
      status: 'RELEASED',
    });

    expect(fetchFn).toHaveBeenCalledWith(
      'http://inventory-service:8080/inventory/reservations/release',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws a readable error when the inventory service rejects the request', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: jest.fn().mockResolvedValue('conflict'),
    });
    const client = new HttpRemoteInventoryReservationClient(remoteConfig, fetchFn);

    await expect(client.validateReservation({
      quoteId: 'quote-1',
      reservationId: 'reservation-1',
      items: [{ inventoryId: 'inventory-1', quantity: 1 }],
    })).rejects.toThrow(
      'Inventory reservation request failed with status 409: conflict',
    );
  });
});

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(payload),
  };
}
