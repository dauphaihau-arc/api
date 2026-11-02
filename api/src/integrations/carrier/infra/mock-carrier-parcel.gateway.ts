import { Logger } from '@nestjs/common';
import ms from 'ms';
import {
  CarrierParcelGateway,
  type CarrierParcelIdentity,
} from '../app/ports/carrier-parcel.gateway';

const REQUEST_TIMEOUT_MS = ms('2s');

export type MockCarrierParcelGatewayOptions = {
  /** Base URL of the Mock Carrier service; unset disables the integration. */
  baseUrl?: string;
};

/**
 * Forwards parcel registration and handover to the Mock Carrier service. The
 * adapter is transport only: callers decide which carriers are observable, and
 * every failure is logged instead of thrown back into the seller command.
 */
export class MockCarrierParcelGateway extends CarrierParcelGateway {
  private readonly logger = new Logger(MockCarrierParcelGateway.name);
  private readonly baseUrl?: string;

  constructor(options: MockCarrierParcelGatewayOptions = {}) {
    super();

    const baseUrl = options.baseUrl?.trim().replace(/\/+$/, '');

    this.baseUrl = baseUrl ? baseUrl : undefined;
  }

  async registerParcel(input: CarrierParcelIdentity): Promise<void> {
    if (!this.baseUrl) {
      return;
    }

    await this.post('/parcels', {
      carrier: input.carrier,
      tracking_number: input.trackingNumber,
    });
  }

  async signalHandover(input: CarrierParcelIdentity): Promise<void> {
    if (!this.baseUrl) {
      return;
    }

    await this.post(
      `/parcels/${encodeURIComponent(input.trackingNumber)}/handover`,
      { carrier: input.carrier },
    );
  }

  private async post(path: string, body: Record<string, string>): Promise<void> {
    const url = `${this.baseUrl}${path}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.warn(
          `Mock Carrier rejected ${path} with status ${response.status}.`,
        );
      }
    }
    catch (error) {
      this.logger.warn(
        `Mock Carrier request to ${path} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
