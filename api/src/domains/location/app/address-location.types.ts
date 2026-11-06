/**
 * Location fields accepted from clients. Canonical alpha-2 country codes and
 * administrative-area codes are the only write identity; free-text subdivision
 * is accepted only for countries that publish no administrative areas.
 */
export interface AddressLocationSelection {
  countryCode?: string | null;
  stateCode?: string | null;
  stateText?: string | null;
}

/** Persisted location state of an address, used while validating updates. */
export interface AddressLocationSnapshot {
  countryCode: string | null;
  stateCode: string | null;
  countryText: string | null;
  stateText: string | null;
}

/**
 * Canonical location identity derived from reference data, plus the display
 * names rendered from it. Names are never persisted again.
 */
export interface ResolvedAddressLocation {
  country: string;
  state: string;
  countryCode: string;
  stateCode: string | null;
  countryText: null;
  stateText: string | null;
}

/** The full location an update should persist. */
export interface AddressLocationUpdate {
  countryCode: string;
  stateCode: string | null;
  countryText: null;
  stateText: string | null;
}
