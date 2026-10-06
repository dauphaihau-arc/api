import { HttpRemoteInventoryReservationClient } from './http-remote-inventory-reservation.client';
import type { InventoryReservationConfig } from '~/platform/config/inventory-reservation.config';
import {
  CheckoutQuoteReservationOutOfStockError,
  CheckoutQuoteReservationUnavailableError,
} from '../../../order/app/errors/order-app.error';

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

    await expect(client.reserveOrder({
      orderId: 'order-1',
      cartId: 'cart-1',
      idempotencyKey: 'order-1:reservation:v1',
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

    const result = await client.reserveOrder({
      orderId: 'order-1',
      cartId: 'cart-1',
      idempotencyKey: 'order-1:reservation:v1',
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
          orderId: 'order-1',
          cartId: 'cart-1',
          idempotencyKey: 'order-1:reservation:v1',
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
      orderId: 'order-1',
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
      orderId: 'order-1',
      reservationId: 'reservation-1',
      reason: 'manual_release',
      idempotencyKey: 'order-1:release:v1',
    })).resolves.toEqual({
      reservationId: 'reservation-1',
      status: 'RELEASED',
    });

    expect(fetchFn).toHaveBeenCalledWith(
      'http://inventory-service:8080/inventory/reservations/release',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('maps an out-of-stock reservation rejection to the local domain error', async () => {
    const fetchFn = jest.fn().mockResolvedValue(rejectionResponse(400, 'insufficient stock'));
    const client = new HttpRemoteInventoryReservationClient(remoteConfig, fetchFn);

    await expect(client.reserveOrder({
      orderId: 'order-1',
      cartId: 'cart-1',
      idempotencyKey: 'order-1:reservation:v1',
      expiresAt: new Date('2026-08-12T05:31:19.013Z'),
      items: [{ inventoryId: 'inventory-1', quantity: 1, title: 'Product' }],
    })).rejects.toBeInstanceOf(CheckoutQuoteReservationOutOfStockError);
  });

  it('maps a reservation idempotency conflict to the unavailable domain error', async () => {
    const fetchFn = jest.fn().mockResolvedValue(rejectionResponse(409, 'conflict'));
    const client = new HttpRemoteInventoryReservationClient(remoteConfig, fetchFn);

    await expect(client.reserveOrder({
      orderId: 'order-1',
      cartId: 'cart-1',
      idempotencyKey: 'order-1:reservation:v1',
      expiresAt: new Date('2026-08-12T05:31:19.013Z'),
      items: [{ inventoryId: 'inventory-1', quantity: 1, title: 'Product' }],
    })).rejects.toBeInstanceOf(CheckoutQuoteReservationUnavailableError);
  });

  it('maps a rejected validation to the unavailable domain error', async () => {
    const fetchFn = jest.fn().mockResolvedValue(rejectionResponse(409, 'conflict'));
    const client = new HttpRemoteInventoryReservationClient(remoteConfig, fetchFn);

    await expect(client.validateReservation({
      orderId: 'order-1',
      reservationId: 'reservation-1',
      items: [{ inventoryId: 'inventory-1', quantity: 1 }],
    })).rejects.toBeInstanceOf(CheckoutQuoteReservationUnavailableError);
  });
});

function rejectionResponse(status: number, body: string) {
  return {
    ok: false,
    status,
    text: jest.fn().mockResolvedValue(body),
  };
}

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(payload),
  };
}
