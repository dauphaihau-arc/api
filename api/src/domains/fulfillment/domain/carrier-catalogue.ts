/**
 * Carriers a seller may record on a Shipment. The catalogue is code-defined:
 * it describes what Arc observes and can label, without storing any provider
 * configuration. `other` accepts any tracking number but cannot be observed.
 */
export type CarrierCode = 'usps' | 'dhl' | 'vnpost' | 'other';

export type CarrierDefinition = {
  readonly code: CarrierCode;
  readonly name: string;
  readonly trackingPattern?: RegExp;
  /** Seller-facing description of the pattern, never the raw expression. */
  readonly trackingHint?: string;
  readonly observable: boolean;
  readonly labelSupported: boolean;
};

export const CARRIER_CATALOGUE: readonly CarrierDefinition[] = [
  {
    code: 'usps',
    name: 'USPS',
    trackingPattern: /^9\d{21}$/,
    trackingHint: '22 digits starting with 9',
    observable: true,
    labelSupported: true,
  },
  {
    code: 'dhl',
    name: 'DHL',
    trackingPattern: /^\d{10}$/,
    trackingHint: '10 digits',
    observable: true,
    labelSupported: true,
  },
  {
    code: 'vnpost',
    name: 'VNPOST',
    trackingPattern: /^[A-Z]{2}\d{9}VN$/,
    trackingHint: 'two letters, nine digits, then VN',
    observable: true,
    labelSupported: true,
  },
  {
    code: 'other',
    name: 'Other',
    observable: false,
    labelSupported: false,
  },
];

/** Resolves a stored carrier code against the catalogue; unknown codes yield undefined. */
export function findCarrier(code?: string | null): CarrierDefinition | undefined {
  if (!code) {
    return undefined;
  }

  const trimmed = code.trim();

  return CARRIER_CATALOGUE.find((carrier) => carrier.code === trimmed);
}

/** True only for catalogue carriers whose scans Arc can observe. */
export function isObservableCarrier(code?: string | null): boolean {
  return findCarrier(code)?.observable === true;
}

/**
 * A carrier without a tracking pattern (`other`) accepts any non-empty tracking
 * number; a catalogue carrier must match the pattern the provider publishes.
 */
export function isValidCarrierTrackingNumber(
  carrier: CarrierDefinition,
  trackingNumber: string,
): boolean {
  const trimmed = trackingNumber.trim();

  if (!trimmed) {
    return false;
  }

  return carrier.trackingPattern === undefined || carrier.trackingPattern.test(trimmed);
}
