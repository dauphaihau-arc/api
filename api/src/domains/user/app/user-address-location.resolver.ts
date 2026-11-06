import { UserAddressLocationError } from './errors/user-address-location.error';
import type {
  LocationAdministrativeArea,
  LocationCountry,
} from '~/domains/location/app/location.types';
import type { LocationReferenceRepository } from '~/domains/location/app/ports/location-reference.repository';
import type {
  UserAddressLocationSelection,
  UserAddressLocationSnapshot,
} from './user-address.types';

export interface ResolvedAddressLocation {
  country: string;
  state: string;
  countryCode: string | null;
  stateCode: string | null;
  countryText: string | null;
  stateText: string | null;
}

export type AddressLocationUpdate = Partial<ResolvedAddressLocation>;

function invalidLocation(code: string, message: string): UserAddressLocationError {
  return new UserAddressLocationError(code, message);
}

function normalizeCode(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim().toUpperCase();

  return trimmed.length > 0 ? trimmed : null;
}

function normalizeText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function sameText(left: string | null, right: string | null): boolean {
  return (left ?? '').trim().toLowerCase() === (right ?? '').trim().toLowerCase();
}

function sameCode(left: string | null, right: string | null): boolean {
  return normalizeCode(left) === normalizeCode(right);
}

function findCountryByCode(
  countries: LocationCountry[],
  countryCode: string,
): LocationCountry | undefined {
  return countries.find((country) => sameCode(country.code, countryCode));
}

function findCountryByNameOrCode(
  countries: LocationCountry[],
  value: string,
): LocationCountry | undefined {
  return countries.find(
    (country) =>
      sameCode(country.code, value) || sameText(country.name, value),
  );
}

function findArea(
  areas: LocationAdministrativeArea[],
  value: string,
): LocationAdministrativeArea | undefined {
  return areas.find(
    (area) => sameCode(area.code, value) || sameText(area.name, value),
  );
}

function codedLocation(
  country: LocationCountry,
  area: LocationAdministrativeArea | null,
  stateText: string | null,
): ResolvedAddressLocation {
  if (area) {
    return {
      country: country.name,
      state: area.name,
      countryCode: country.code,
      stateCode: area.code,
      countryText: null,
      stateText: null,
    };
  }

  return {
    country: country.name,
    state: stateText ?? '',
    countryCode: country.code,
    stateCode: null,
    countryText: null,
    stateText,
  };
}

/**
 * Create validation. Coded writes require an active country and, when that
 * country publishes areas, an active area code. Legacy name-only writes stay
 * supported: names are resolved when possible and otherwise preserved as text.
 */
export async function resolveCreateAddressLocation(
  repository: LocationReferenceRepository,
  selection: UserAddressLocationSelection,
): Promise<ResolvedAddressLocation> {
  const countryCode = normalizeCode(selection.countryCode);
  const stateCode = normalizeCode(selection.stateCode);
  const stateText = normalizeText(selection.stateText);
  const legacyCountry = normalizeText(selection.country);
  const legacyState = normalizeText(selection.state) ?? '';

  if (countryCode || stateCode || stateText) {
    if (!countryCode) {
      throw invalidLocation(
        'ADDRESS_COUNTRY_CODE_REQUIRED',
        'country_code is required when a location code is provided',
      );
    }

    if (stateCode && stateText) {
      throw invalidLocation(
        'ADDRESS_STATE_TEXT_NOT_ALLOWED',
        'state_text cannot be combined with state_code',
      );
    }

    const countries = await repository.findActiveCountries();
    const country = findCountryByCode(countries, countryCode);

    if (!country) {
      throw invalidLocation(
        'ADDRESS_COUNTRY_UNKNOWN',
        'country_code is unknown or inactive',
      );
    }

    const areas = await repository.findActiveAdministrativeAreas(country.code);
    const availableAreas = areas ?? [];

    if (availableAreas.length > 0) {
      if (stateText) {
        throw invalidLocation(
          'ADDRESS_STATE_TEXT_NOT_ALLOWED',
          'state_text is not allowed when the country publishes administrative areas',
        );
      }

      if (!stateCode) {
        throw invalidLocation(
          'ADDRESS_STATE_CODE_REQUIRED',
          'state_code is required for the selected country',
        );
      }

      const area = findArea(availableAreas, stateCode);

      if (!area) {
        throw invalidLocation(
          'ADDRESS_STATE_UNKNOWN',
          'state_code is unknown or inactive for the selected country',
        );
      }

      return codedLocation(country, area, null);
    }

    if (stateCode) {
      throw invalidLocation(
        'ADDRESS_STATE_CODE_NOT_ALLOWED',
        'state_code is not allowed for the selected country',
      );
    }

    // Name-only fields remain usable alongside a country code for countries
    // that do not publish a subdivision list.
    return codedLocation(
      country,
      null,
      stateText ?? (legacyState.length > 0 ? legacyState : null),
    );
  }

  if (!legacyCountry) {
    throw invalidLocation(
      'ADDRESS_COUNTRY_REQUIRED',
      'country is required when country_code is omitted',
    );
  }

  if (selection.state === undefined || selection.state === null) {
    throw invalidLocation(
      'ADDRESS_STATE_REQUIRED',
      'state is required when state_code is omitted',
    );
  }

  const countries = await repository.findActiveCountries();
  const country = findCountryByNameOrCode(countries, legacyCountry);

  if (!country) {
    return {
      country: legacyCountry,
      state: legacyState,
      countryCode: null,
      stateCode: null,
      countryText: legacyCountry,
      stateText: legacyState.length > 0 ? legacyState : null,
    };
  }

  const areas = await repository.findActiveAdministrativeAreas(country.code);
  const availableAreas = areas ?? [];

  if (availableAreas.length === 0) {
    return codedLocation(
      country,
      null,
      legacyState.length > 0 ? legacyState : null,
    );
  }

  const area = findArea(availableAreas, legacyState);

  if (area) {
    return codedLocation(country, area, null);
  }

  // Name-only clients may send a subdivision that is not in the current
  // dataset; keep the submitted label instead of rejecting the write.
  return codedLocation(
    country,
    null,
    legacyState.length > 0 ? legacyState : null,
  );
}

/**
 * Update validation. Omitted fields are preserved, explicit nulls clear
 * nullable columns, and changing country still requires the new country's
 * subdivision data in the same request.
 */
export async function resolveUpdateAddressLocation(
  repository: LocationReferenceRepository,
  existing: UserAddressLocationSnapshot,
  selection: UserAddressLocationSelection,
): Promise<AddressLocationUpdate | null> {
  const hasCountryCode = selection.countryCode !== undefined;
  const hasStateCode = selection.stateCode !== undefined;
  const hasStateText = selection.stateText !== undefined;
  const hasLegacyCountry = selection.country !== undefined;
  const hasLegacyState = selection.state !== undefined;
  const touchesLocation =
    hasCountryCode
    || hasStateCode
    || hasStateText
    || hasLegacyCountry
    || hasLegacyState;

  if (!touchesLocation) {
    return null;
  }

  const countries = await repository.findActiveCountries();

  let country = existing.country;
  let countryCode = existing.countryCode;
  let countryText = existing.countryText;
  let state = existing.state;
  let stateCode = existing.stateCode;
  let stateText = existing.stateText;
  let countryChanged = false;

  if (hasCountryCode) {
    const nextCountryCode = normalizeCode(selection.countryCode);

    if (nextCountryCode === null) {
      countryChanged = !sameCode(countryCode, null);
      countryCode = null;
      countryText = country;
      stateCode = null;
      stateText = null;
    }
    else if (!sameCode(nextCountryCode, countryCode)) {
      const nextCountry = findCountryByCode(countries, nextCountryCode);

      if (!nextCountry) {
        throw invalidLocation(
          'ADDRESS_COUNTRY_UNKNOWN',
          'country_code is unknown or inactive',
        );
      }

      countryChanged = true;
      country = nextCountry.name;
      countryCode = nextCountry.code;
      countryText = null;
      stateCode = null;
      stateText = null;
      state = '';
    }
    else {
      const activeCountry = findCountryByCode(countries, nextCountryCode);

      if (activeCountry) {
        country = activeCountry.name;
      }
    }
  }
  else if (hasLegacyCountry) {
    const legacyCountry = normalizeText(selection.country);

    if (!legacyCountry) {
      throw invalidLocation(
        'ADDRESS_COUNTRY_REQUIRED',
        'country cannot be empty',
      );
    }

    const matchedCountry = findCountryByNameOrCode(countries, legacyCountry);

    if (matchedCountry) {
      if (!sameCode(matchedCountry.code, countryCode)) {
        countryChanged = true;
        country = matchedCountry.name;
        countryCode = matchedCountry.code;
        countryText = null;
        stateCode = null;
        stateText = null;
        state = '';
      }
      else {
        country = matchedCountry.name;
      }
    }
    else if (countryCode === null) {
      countryChanged = !sameText(legacyCountry, country);
      country = legacyCountry;
      countryText = legacyCountry;
    }
    else if (!sameText(legacyCountry, country)) {
      // The dataset changed or the client sent an alias; a known code remains
      // authoritative unless the request explicitly selects another country.
      country = existing.country;
    }
  }

  let availableAreas: LocationAdministrativeArea[] | null = null;
  let areasLoaded = false;

  const loadAreas = async (): Promise<LocationAdministrativeArea[]> => {
    if (!countryCode) {
      return [];
    }

    if (!areasLoaded) {
      availableAreas =
        await repository.findActiveAdministrativeAreas(countryCode);
      areasLoaded = true;
    }

    return availableAreas ?? [];
  };

  const countryHasAreas = async (): Promise<boolean> =>
    (await loadAreas()).length > 0;

  if (hasStateCode) {
    const nextStateCode = normalizeCode(selection.stateCode);

    if (nextStateCode === null) {
      stateCode = null;
    }
    else if (!sameCode(nextStateCode, stateCode) || countryChanged) {
      if (!countryCode) {
        throw invalidLocation(
          'ADDRESS_COUNTRY_CODE_REQUIRED',
          'state_code requires a country_code',
        );
      }

      const areas = await loadAreas();

      if (areas.length === 0) {
        throw invalidLocation(
          'ADDRESS_STATE_CODE_NOT_ALLOWED',
          'state_code is not allowed for the selected country',
        );
      }

      const area = findArea(areas, nextStateCode);

      if (!area) {
        throw invalidLocation(
          'ADDRESS_STATE_UNKNOWN',
          'state_code is unknown or inactive for the selected country',
        );
      }

      stateCode = area.code;
      state = area.name;
      stateText = null;
    }

    if (stateCode !== null) {
      if (hasStateText && normalizeText(selection.stateText) !== null) {
        throw invalidLocation(
          'ADDRESS_STATE_TEXT_NOT_ALLOWED',
          'state_text cannot be combined with state_code',
        );
      }

      stateText = null;
    }
    else if (hasStateText) {
      const nextStateText = normalizeText(selection.stateText);

      if (nextStateText !== null && countryCode && (await countryHasAreas())) {
        throw invalidLocation(
          'ADDRESS_STATE_TEXT_NOT_ALLOWED',
          'state_text is not allowed when the country publishes administrative areas',
        );
      }

      stateText = nextStateText;
      if (nextStateText !== null) {
        state = nextStateText;
      }
    }
  }
  else if (hasStateText) {
    const nextStateText = normalizeText(selection.stateText);

    if (nextStateText !== null) {
      if (countryCode && (await countryHasAreas())) {
        throw invalidLocation(
          'ADDRESS_STATE_TEXT_NOT_ALLOWED',
          'state_text is not allowed when the country publishes administrative areas',
        );
      }

      stateCode = null;
      stateText = nextStateText;
      state = nextStateText;
    }
    else {
      stateText = null;
    }
  }
  else if (hasLegacyState) {
    const legacyState = normalizeText(selection.state) ?? '';

    if (
      !countryChanged
      && (sameText(legacyState, state) || sameCode(legacyState, stateCode))
    ) {
      // Unchanged legacy labels keep the existing codes untouched.
    }
    else if (!countryCode) {
      stateCode = null;
      stateText = legacyState.length > 0 ? legacyState : null;
      state = legacyState;
    }
    else {
      const areas = await loadAreas();

      if (areas.length === 0) {
        stateCode = null;
        stateText = legacyState.length > 0 ? legacyState : null;
        state = legacyState;
      }
      else {
        const area = findArea(areas, legacyState);

        if (area) {
          stateCode = area.code;
          stateText = null;
          state = area.name;
        }
        else {
          // Preserve unresolved legacy labels as text so name-only clients can
          // still update addresses.
          stateCode = null;
          stateText = legacyState.length > 0 ? legacyState : null;
          state = legacyState;
        }
      }
    }
  }

  // A country change always has to bring the new country's subdivision data,
  // even when the request clears the previous state instead of omitting it.
  if (
    countryChanged
    && countryCode
    && stateCode === null
    && stateText === null
  ) {
    const areas = await loadAreas();

    if (areas.length > 0) {
      throw invalidLocation(
        'ADDRESS_STATE_CODE_REQUIRED',
        'state_code is required for the selected country',
      );
    }

    stateCode = null;
    stateText = null;
  }

  if (countryCode === null) {
    if (countryText === null) {
      countryText = country;
    }

    stateCode = null;
  }

  return {
    country,
    state,
    countryCode,
    stateCode,
    countryText,
    stateText,
  };
}
