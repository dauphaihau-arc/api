/**
 * Location fields accepted from clients. Codes take precedence over legacy
 * display names, which remain accepted during the expand release.
 */
export interface AddressLocationSelection {
  country?: string;
  state?: string;
  countryCode?: string | null;
  stateCode?: string | null;
  stateText?: string | null;
}

/** Persisted location state of an address, used while validating updates. */
export interface AddressLocationSnapshot {
  country: string;
  state: string;
  countryCode: string | null;
  stateCode: string | null;
  countryText: string | null;
  stateText: string | null;
}

/** Canonical location identity derived from reference data. */
export interface ResolvedAddressLocation {
  country: string;
  state: string;
  countryCode: string | null;
  stateCode: string | null;
  countryText: string | null;
  stateText: string | null;
}

export type AddressLocationUpdate = Partial<ResolvedAddressLocation>;
