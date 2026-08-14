import { Inject, Injectable } from '@nestjs/common';
import {
  INVENTORY_RESERVATION_CONFIG,
  type InventoryReservationConfig,
} from '~/platform/config/inventory-reservation.config';
import {
  RemoteInventoryReservationClient,
  type RemoteReleaseReservationInput,
  type RemoteReleaseReservationResult,
  type RemoteReserveQuoteInput,
  type RemoteReserveQuoteResult,
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
    );
  }

  async validateReservation(
    input: RemoteValidateReservationInput,
  ): Promise<RemoteValidateReservationResult> {
    return this.post<RemoteValidateReservationResult>(
      '/inventory/reservations/validate',
      input,
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

  private async post<TResponse>(
    path: string,
    body: unknown,
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

      throw new Error(
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
