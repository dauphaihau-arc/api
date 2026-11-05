/**
 * Stable contract a fulfillment command uses to tell an observable carrier
 * about a parcel it already recorded. Implementations are best-effort: a
 * carrier outage must never make the seller command fail.
 */
export const CARRIER_RATE_SERVICES = ['standard', 'express'] as const;

export type CarrierRateService = (typeof CARRIER_RATE_SERVICES)[number];

export type CarrierParcelIdentity = {
  carrier: string;
  trackingNumber: string;
};

/** Package facts a rate quote is priced from, in the carrier's units. */
export type CarrierRateQuoteRequest = {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  currency: string;
};

/** One priced carrier/service option returned by a rate quote. */
export type CarrierRateQuote = {
  quoteId: string;
  carrier: string;
  service: CarrierRateService;
  priceMinor: number;
  currency: string;
  estimatedDays: { min: number; max: number };
  expiresAt: string;
};

/**
 * Raised when the carrier integration is disabled, unreachable, or refuses a
 * quote. Unlike parcel registration, quoting has no local fallback: the seller
 * asked for prices, so the HTTP layer answers 503 instead of an empty list.
 */
export class CarrierRateQuoteUnavailableError extends Error {
  constructor() {
    super('Shipping rates are temporarily unavailable');
    this.name = 'CarrierRateQuoteUnavailableError';
  }
}

/** One purchased label, with the carrier's PDF decoded from its wire encoding. */
export type CarrierPurchasedLabel = {
  labelId: string;
  quoteId: string;
  carrier: string;
  service: string;
  trackingNumber: string;
  priceMinor: number;
  currency: string;
  pdf: Buffer;
};

/**
 * Raised when the carrier refuses a quote because it is unknown, expired, or
 * already used. Every one of those cases means the seller must re-quote.
 */
export class CarrierLabelQuoteRejectedError extends Error {
  constructor() {
    super('This rate quote can no longer be purchased');
    this.name = 'CarrierLabelQuoteRejectedError';
  }
}

/**
 * Raised when the carrier integration is disabled, unreachable, or returns a
 * payload outside the shared label contract. A purchase cannot fall back
 * locally: the seller either gets the carrier's label or nothing at all.
 */
export class CarrierLabelPurchaseUnavailableError extends Error {
  constructor() {
    super('Carrier labels are temporarily unavailable');
    this.name = 'CarrierLabelPurchaseUnavailableError';
  }
}

/**
 * Raised when a refund is asked for a label the carrier does not know. The
 * caller cannot retry the same label: its local evidence is stale.
 */
export class CarrierLabelNotFoundError extends Error {
  constructor() {
    super('Carrier label was not found');
    this.name = 'CarrierLabelNotFoundError';
  }
}

/**
 * Raised when the carrier refuses to refund a label because the parcel has
 * already entered its network. A used label can never be refunded.
 */
export class CarrierLabelAlreadyUsedError extends Error {
  constructor() {
    super('Carrier label has already been used');
    this.name = 'CarrierLabelAlreadyUsedError';
  }
}

/**
 * Raised when the carrier integration is disabled, unreachable, or otherwise
 * fails the refund. Nothing local is voided, so the seller can retry later.
 */
export class CarrierLabelRefundUnavailableError extends Error {
  constructor() {
    super('Carrier label refund is temporarily unavailable');
    this.name = 'CarrierLabelRefundUnavailableError';
  }
}

export abstract class CarrierParcelGateway {
  abstract registerParcel(input: CarrierParcelIdentity): Promise<void>;

  abstract signalHandover(input: CarrierParcelIdentity): Promise<void>;

  abstract quoteRates(input: CarrierRateQuoteRequest): Promise<CarrierRateQuote[]>;

  abstract purchaseLabel(input: { quoteId: string; currency: string }): Promise<CarrierPurchasedLabel>;

  /**
   * Voids a purchased label at the carrier. The carrier answers idempotently
   * for a label it already voided, so retrying a refund is safe.
   */
  abstract refundLabel(input: { labelId: string }): Promise<void>;
}
