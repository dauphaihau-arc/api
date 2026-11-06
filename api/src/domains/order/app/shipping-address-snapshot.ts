import type { ShippingAddressInput } from './order.types';

/**
 * The frozen shipping-address shape of new quotes and order snapshots. Codes
 * are nullable only for destinations the reference data cannot resolve during
 * the expand release; historical snapshots keep whatever they were written
 * with and are never rewritten.
 */
export interface PersistedShippingAddress {
  full_name: string;
  address1: string;
  address2?: string;
  city: string;
  country: string;
  country_code: string | null;
  state: string;
  state_code: string | null;
  zip: string;
  phone: string;
}

/**
 * Canonical phone text for a snapshot. Full E.164 validation depends on the
 * selected country and lands with the phone-validation work; until then the
 * stored value is at least trimmed so cosmetic whitespace never changes it.
 */
export function normalizeShippingPhone(phone: string): string {
  return phone.trim();
}

export function toPersistedShippingAddress(
  input: ShippingAddressInput,
): PersistedShippingAddress {
  return {
    full_name: input.fullName,
    address1: input.address1,
    address2: input.address2,
    city: input.city,
    country: input.country,
    country_code: input.countryCode ?? null,
    state: input.state,
    state_code: input.stateCode ?? null,
    zip: input.zip,
    phone: normalizeShippingPhone(input.phone),
  };
}

/** Reads either a new coded snapshot or a legacy name-only one. */
export function fromPersistedShippingAddress(value: unknown): ShippingAddressInput {
  const address = (value ?? {}) as Record<string, unknown>;
  const readText = (key: string): string => String(address[key] ?? '');
  const readOptionalText = (key: string): string | undefined => {
    const raw = address[key];

    return raw === undefined || raw === null ? undefined : String(raw);
  };
  const readCode = (key: string): string | null => {
    const raw = address[key];

    return typeof raw === 'string' && raw.trim().length > 0
      ? raw.trim().toUpperCase()
      : null;
  };

  return {
    fullName: readText('full_name'),
    address1: readText('address1'),
    address2: readOptionalText('address2'),
    city: readText('city'),
    country: readText('country'),
    state: readText('state'),
    countryCode: readCode('country_code'),
    stateCode: readCode('state_code'),
    zip: readText('zip'),
    phone: readText('phone'),
  };
}
