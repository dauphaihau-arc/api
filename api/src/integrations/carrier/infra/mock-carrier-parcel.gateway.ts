import { Logger } from '@nestjs/common';
import ms from 'ms';
import { z } from 'zod';
import {
  CARRIER_RATE_SERVICES,
  CarrierLabelAlreadyUsedError,
  CarrierLabelNotFoundError,
  CarrierLabelPurchaseUnavailableError,
  CarrierLabelQuoteRejectedError,
  CarrierLabelRefundUnavailableError,
  CarrierParcelGateway,
  CarrierRateQuoteUnavailableError,
  type CarrierParcelIdentity,
  type CarrierPurchasedLabel,
  type CarrierRateQuote,
  type CarrierRateQuoteRequest,
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

  /**
   * Asks the carrier to price a package. Unlike registration this call is not
   * best-effort: a disabled integration, transport failure, or refused quote
   * surfaces as `CarrierRateQuoteUnavailableError` so the HTTP layer can answer
   * 503 instead of pretending there are no options.
   */
  async quoteRates(input: CarrierRateQuoteRequest): Promise<CarrierRateQuote[]> {
    if (!this.baseUrl) {
      throw new CarrierRateQuoteUnavailableError();
    }

    const path = '/rates';

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          weight_grams: input.weightGrams,
          length_cm: input.lengthCm,
          width_cm: input.widthCm,
          height_cm: input.heightCm,
          currency: input.currency,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.warn(
          `Mock Carrier rejected ${path} with status ${response.status}.`,
        );
        throw new CarrierRateQuoteUnavailableError();
      }

      return readRateQuotes(await response.json());
    }
    catch (error) {
      if (error instanceof CarrierRateQuoteUnavailableError) {
        throw error;
      }

      this.logger.warn(
        `Mock Carrier request to ${path} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new CarrierRateQuoteUnavailableError();
    }
  }

  /**
   * Buys the label behind a quote. A quote the carrier no longer honours (404,
   * 409, or 410) is surfaced separately from an outage so the seller can
   * distinguish "re-quote" from "try again later"; nothing is persisted here.
   */
  async purchaseLabel(input: { quoteId: string; currency: string }): Promise<CarrierPurchasedLabel> {
    if (!this.baseUrl) {
      throw new CarrierLabelPurchaseUnavailableError();
    }

    const path = '/labels';

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quote_id: input.quoteId, currency: input.currency }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    }
    catch (error) {
      this.logger.warn(
        `Mock Carrier request to ${path} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new CarrierLabelPurchaseUnavailableError();
    }

    if ([404, 409, 410].includes(response.status)) {
      this.logger.warn(
        `Mock Carrier rejected ${path} with status ${response.status}.`,
      );
      throw new CarrierLabelQuoteRejectedError();
    }

    if (!response.ok) {
      this.logger.warn(
        `Mock Carrier rejected ${path} with status ${response.status}.`,
      );
      throw new CarrierLabelPurchaseUnavailableError();
    }

    let payload: unknown;

    try {
      payload = await response.json();
    }
    catch (error) {
      this.logger.warn(
        `Mock Carrier returned an unreadable ${path} payload: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new CarrierLabelPurchaseUnavailableError();
    }

    return readPurchasedLabel(payload);
  }

  /**
   * Voids a label at the carrier. A missing label and an already-used parcel
   * are contractual refusals the seller must see distinctly; every other
   * failure is an outage that leaves local state untouched.
   */
  async refundLabel(input: { labelId: string }): Promise<void> {
    if (!this.baseUrl) {
      throw new CarrierLabelRefundUnavailableError();
    }

    const path = `/labels/${encodeURIComponent(input.labelId)}/refund`;

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    }
    catch (error) {
      this.logger.warn(
        `Mock Carrier request to ${path} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new CarrierLabelRefundUnavailableError();
    }

    if (response.status === 404) {
      this.logger.warn(`Mock Carrier rejected ${path} with status 404.`);
      throw new CarrierLabelNotFoundError();
    }

    if (response.status === 409) {
      this.logger.warn(`Mock Carrier rejected ${path} with status 409.`);
      throw new CarrierLabelAlreadyUsedError();
    }

    if (!response.ok) {
      this.logger.warn(
        `Mock Carrier rejected ${path} with status ${response.status}.`,
      );
      throw new CarrierLabelRefundUnavailableError();
    }
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

const rateQuoteWireSchema = z.object({
  quote_id: z.string(),
  carrier: z.string(),
  service: z.enum(CARRIER_RATE_SERVICES),
  price_minor: z.number().int(),
  currency: z.string(),
  estimated_days: z.object({ min: z.number().int(), max: z.number().int() }),
  expires_at: z.string(),
});

const rateQuotesWireSchema = z.object({ rates: z.array(rateQuoteWireSchema) });

const purchasedLabelWireSchema = z.object({
  label: z.object({
    label_id: z.string(),
    quote_id: z.string(),
    carrier: z.string(),
    service: z.string(),
    tracking_number: z.string(),
    price_minor: z.number().int(),
    currency: z.string(),
    pdf_base64: z.string().min(1),
  }),
});

/**
 * Decodes the carrier's base64 PDF at the wire boundary. A payload that does
 * not match the shared contract, or whose PDF is not a PDF at all, is treated
 * as an unavailable purchase rather than stored as a corrupt label.
 */
function readPurchasedLabel(payload: unknown): CarrierPurchasedLabel {
  const parsed = purchasedLabelWireSchema.safeParse(payload);

  if (!parsed.success) {
    throw new CarrierLabelPurchaseUnavailableError();
  }

  const label = parsed.data.label;
  const pdf = Buffer.from(label.pdf_base64, 'base64');

  if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new CarrierLabelPurchaseUnavailableError();
  }

  return {
    labelId: label.label_id,
    quoteId: label.quote_id,
    carrier: label.carrier,
    service: label.service,
    trackingNumber: label.tracking_number,
    priceMinor: label.price_minor,
    currency: label.currency,
    pdf,
  };
}

/**
 * Reads the carrier's snake_case quote payload into the port's camelCase shape.
 * A payload that does not match the shared contract is treated as an
 * unavailable quote rather than half-mapped into the seller contract.
 */
function readRateQuotes(payload: unknown): CarrierRateQuote[] {
  const parsed = rateQuotesWireSchema.safeParse(payload);

  if (!parsed.success) {
    throw new CarrierRateQuoteUnavailableError();
  }

  return parsed.data.rates.map((rate) => ({
    quoteId: rate.quote_id,
    carrier: rate.carrier,
    service: rate.service,
    priceMinor: rate.price_minor,
    currency: rate.currency,
    estimatedDays: { min: rate.estimated_days.min, max: rate.estimated_days.max },
    expiresAt: rate.expires_at,
  }));
}
