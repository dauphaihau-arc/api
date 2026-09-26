import { Inject, Injectable } from '@nestjs/common';
import {
  INVENTORY_RESERVATION_CONFIG,
  type InventoryReservationConfig,
} from '~/platform/config/inventory-reservation.config';
import {
  CheckoutQuoteReservationOutOfStockError,
  CheckoutQuoteReservationUnavailableError,
} from '../../../order/app/errors/order-app.error';
import {
  RemoteInventoryReservationClient,
  type RemoteReleaseReservationInput,
  type RemoteReleaseReservationResult,
  type RemoteReserveQuoteInput,
  type RemoteReserveQuoteResult,
  type RemoteRestoreSaleInput,
  type RemoteRestoreSaleResult,
  type RemoteValidateReservationInput,
  type RemoteValidateReservationResult,
} from '../../app/ports/remote-inventory-reservation.client';

type FetchLike = (
  input: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export const FETCH = Symbol('FETCH');

@Injectable()
export class HttpRemoteInventoryReservationClient
implements RemoteInventoryReservationClient {
  constructor(
    @Inject(INVENTORY_RESERVATION_CONFIG)
    private readonly inventoryReservationConfig: InventoryReservationConfig,
    @Inject(FETCH)
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  async reserveQuote(
    input: RemoteReserveQuoteInput,
  ): Promise<RemoteReserveQuoteResult> {
    return this.post<RemoteReserveQuoteResult>(
      '/inventory/reservations/quote',
      {
        ...input,
        expiresAt: input.expiresAt.toISOString(),
      },
      (status) => {
        if (status === 400) {
          return new CheckoutQuoteReservationOutOfStockError();
        }
        if (status === 409) {
          return new CheckoutQuoteReservationUnavailableError();
        }

        return undefined;
      },
    );
  }

  async validateReservation(
    input: RemoteValidateReservationInput,
  ): Promise<RemoteValidateReservationResult> {
    return this.post<RemoteValidateReservationResult>(
      '/inventory/reservations/validate',
      input,
      () => new CheckoutQuoteReservationUnavailableError(),
    );
  }

  async releaseReservation(
    input: RemoteReleaseReservationInput,
  ): Promise<RemoteReleaseReservationResult> {
    return this.post<RemoteReleaseReservationResult>(
      '/inventory/reservations/release',
      input,
    );
  }

  async restoreSale(
    input: RemoteRestoreSaleInput,
  ): Promise<RemoteRestoreSaleResult> {
    return this.post<RemoteRestoreSaleResult>(
      '/inventory/reservations/restore-sale',
      input,
    );
  }

  private async post<TResponse>(
    path: string,
    body: unknown,
    mapError?: (status: number) => Error | undefined,
  ): Promise<TResponse> {
    this.assertRemoteDriverEnabled();

    const response = await this.fetchFn(
      `${this.inventoryReservationConfig.serviceBaseUrl}${path}`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const responseBody = await response.text();

      // The configured Inventory authority reports business rejections through
      // HTTP status codes; map them to the same domain errors the local
      // implementation raises so callers see one contract in both modes.
      throw mapError?.(response.status) ??
        new Error(
          `Inventory reservation request failed with status ${response.status}: ${responseBody}`,
        );
    }

    return await response.json() as TResponse;
  }

  private assertRemoteDriverEnabled(): void {
    if (this.inventoryReservationConfig.driver === 'remote') {
      return;
    }

    throw new Error(
      `Remote inventory reservation client called while INVENTORY_RESERVATION_DRIVER is ${this.inventoryReservationConfig.driver}`,
    );
  }
}
