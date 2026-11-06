import {
  parsePhoneNumberFromString,
  type CountryCode,
  type PhoneNumber,
} from 'libphonenumber-js';
import {
  postcodeValidator,
  postcodeValidatorExistsForCountry,
} from 'postcode-validator';
import { AddressContactError } from './errors/address-contact.error';
import { mergeCountryAddressRules } from './address-rules.merge';
import type {
  CountryAddressRules,
  LocationCountry,
} from './location.types';
import type { LocationReferenceRepository } from './ports/location-reference.repository';

/** Contact fields accepted from clients when an address is written. */
export interface AddressContactSelection {
  phone: string;
  zip: string;
}

/** Persisted contact state of an address, used while validating updates. */
export interface AddressContactSnapshot {
  phone: string;
  zip: string;
}

/** Normalized contact values that are safe to persist. */
export interface ResolvedAddressContact {
  phone: string;
  zip: string;
}

/** Contact fields an update actually changes; omitted fields stay stored. */
export interface AddressContactUpdate {
  phone?: string;
  zip?: string;
}

function invalidContact(code: string, message: string): AddressContactError {
  return new AddressContactError(code, message);
}

function normalizeCode(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim().toUpperCase();

  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Postcodes are stored in a single canonical text form so cosmetic spacing and
 * casing never make an unchanged value look edited.
 */
export function normalizePostcode(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

function validatePhone(phone: string, country: LocationCountry | null): string {
  const normalized = phone.trim();

  if (!country) {
    return normalized;
  }

  let parsed: PhoneNumber | undefined;

  try {
    parsed = parsePhoneNumberFromString(
      normalized,
      country.code as CountryCode,
    );
  }
  catch {
    parsed = undefined;
  }

  if (!parsed || !parsed.isValid()) {
    throw invalidContact(
      'ADDRESS_PHONE_INVALID',
      'phone is not a valid number for the selected country',
    );
  }

  return parsed.number;
}

interface ResolvedCountryRules {
  country: LocationCountry;
  rules: CountryAddressRules;
}

function validatePostcode(
  postcode: string,
  resolved: ResolvedCountryRules | null,
): string {
  const normalized = normalizePostcode(postcode);

  if (!resolved) {
    return normalized;
  }

  const zipRule = resolved.rules.fields.find((field) => field.key === 'zip');

  // A country whose format has no postal code accepts any client value but
  // stores an empty string, so hidden postcodes never leak into addresses.
  if (zipRule && !zipRule.visible) {
    return '';
  }

  if (normalized.length === 0) {
    if (zipRule?.required ?? resolved.country.postalCodeRequired) {
      throw invalidContact(
        'ADDRESS_POSTCODE_REQUIRED',
        'postcode is required for the selected country',
      );
    }

    return normalized;
  }

  if (
    postcodeValidatorExistsForCountry(resolved.country.code)
    && !postcodeValidator(normalized, resolved.country.code)
  ) {
    throw invalidContact(
      'ADDRESS_POSTCODE_INVALID',
      'postcode is not valid for the selected country',
    );
  }

  return normalized;
}

async function loadCountryRules(
  repository: LocationReferenceRepository,
  countryCode: string | null,
): Promise<ResolvedCountryRules | null> {
  if (!countryCode) {
    return null;
  }

  const country = await repository.findActiveCountry(countryCode);

  if (!country) {
    return null;
  }

  const override = await repository.findAddressRuleOverride(country.code);

  return {
    country,
    rules: mergeCountryAddressRules({
      countryCode: country.code,
      hasAdministrativeAreas: country.hasAdministrativeAreas,
      postalCodeRequired: country.postalCodeRequired,
      override,
    }),
  };
}

/**
 * Create validation. New addresses always validate their contact fields
 * against the resolved country; unresolved legacy countries keep accepting
 * any normalized text because no reference rules exist for them.
 */
export async function resolveCreateAddressContact(
  repository: LocationReferenceRepository,
  countryCode: string | null,
  selection: AddressContactSelection,
): Promise<ResolvedAddressContact> {
  const resolved = await loadCountryRules(
    repository,
    normalizeCode(countryCode),
  );

  return {
    phone: validatePhone(selection.phone, resolved?.country ?? null),
    zip: validatePostcode(selection.zip, resolved),
  };
}

/**
 * Update validation. Only submitted values that differ from the stored ones
 * are validated, so an unchanged legacy phone or postcode survives unrelated
 * edits. Omitted fields are not touched.
 */
export async function resolveUpdateAddressContact(
  repository: LocationReferenceRepository,
  countryCode: string | null,
  existing: AddressContactSnapshot,
  selection: Partial<AddressContactSelection>,
): Promise<AddressContactUpdate> {
  const update: AddressContactUpdate = {};
  const phone = typeof selection.phone === 'string' ? selection.phone : undefined;
  const zip = typeof selection.zip === 'string' ? selection.zip : undefined;

  const phoneChanged = phone !== undefined
    && phone.trim() !== existing.phone.trim();

  const zipChanged = zip !== undefined
    && normalizePostcode(zip) !== normalizePostcode(existing.zip);

  if (!phoneChanged && !zipChanged) {
    return update;
  }

  const resolved = await loadCountryRules(
    repository,
    normalizeCode(countryCode),
  );

  if (phoneChanged && phone !== undefined) {
    update.phone = validatePhone(phone, resolved?.country ?? null);
  }

  if (zipChanged && zip !== undefined) {
    update.zip = validatePostcode(zip, resolved);
  }

  return update;
}
