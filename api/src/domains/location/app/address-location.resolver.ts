import { AddressLocationError } from './errors/address-location.error';
import type {
  AddressLocationSelection,
  AddressLocationSnapshot,
  AddressLocationUpdate,
  ResolvedAddressLocation,
} from './address-location.types';
import type {
  LocationAdministrativeArea,
  LocationCountry,
} from '~/domains/location/app/location.types';
import type { LocationReferenceRepository } from '~/domains/location/app/ports/location-reference.repository';

/**
 * Create validation. `country_code` is the only country identity. A country
 * that publishes administrative areas requires an active `state_code` and
 * rejects free text; a country with no area list accepts `state_text` and
 * rejects area codes.
 */
export async function resolveCreateAddressLocation(
  repository: LocationReferenceRepository,
  selection: AddressLocationSelection,
): Promise<ResolvedAddressLocation> {
  const countryCode = normalizeCode(selection.countryCode);

  if (!countryCode) {
    throw invalidLocation(
      'ADDRESS_COUNTRY_CODE_REQUIRED',
      'country_code is required',
    );
  }

  const stateCode = normalizeCode(selection.stateCode);
  const stateText = normalizeText(selection.stateText);

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

  const areas = (await repository.findActiveAdministrativeAreas(country.code)) ?? [];

  if (areas.length > 0) {
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

    const area = findArea(areas, stateCode);

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

  return codedLocation(country, null, stateText);
}

/**
 * Update validation. Omitted fields are preserved, an explicit `state_code`
 * of null clears the subdivision, and a country change has to bring the new
 * country's subdivision data in the same request. Rows written before codes
 * existed keep their preserved text until the client selects real codes.
 */
export async function resolveUpdateAddressLocation(
  repository: LocationReferenceRepository,
  existing: AddressLocationSnapshot,
  selection: AddressLocationSelection,
): Promise<AddressLocationUpdate | null> {
  const hasCountryCode = selection.countryCode !== undefined;
  const hasStateCode = selection.stateCode !== undefined;
  const hasStateText = selection.stateText !== undefined;

  if (!hasCountryCode && !hasStateCode && !hasStateText) {
    return null;
  }

  let countryCode = existing.countryCode;
  let stateCode = existing.stateCode;
  let stateText = existing.stateText;
  let countryChanged = false;

  if (hasCountryCode) {
    const nextCountryCode = normalizeCode(selection.countryCode);

    if (!nextCountryCode) {
      throw invalidLocation(
        'ADDRESS_COUNTRY_CODE_REQUIRED',
        'country_code is required',
      );
    }

    if (!sameCode(nextCountryCode, existing.countryCode)) {
      const countries = await repository.findActiveCountries();
      const nextCountry = findCountryByCode(countries, nextCountryCode);

      if (!nextCountry) {
        throw invalidLocation(
          'ADDRESS_COUNTRY_UNKNOWN',
          'country_code is unknown or inactive',
        );
      }

      countryCode = nextCountry.code;
      stateCode = null;
      stateText = null;
      countryChanged = true;
    }
    else {
      countryCode = nextCountryCode;
    }
  }

  let areas: LocationAdministrativeArea[] | null = null;

  const loadAreas = async (): Promise<LocationAdministrativeArea[]> => {
    if (!countryCode) {
      return [];
    }

    areas ??= (await repository.findActiveAdministrativeAreas(countryCode)) ?? [];

    return areas;
  };

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

      const availableAreas = await loadAreas();

      if (availableAreas.length === 0) {
        throw invalidLocation(
          'ADDRESS_STATE_CODE_NOT_ALLOWED',
          'state_code is not allowed for the selected country',
        );
      }

      const area = findArea(availableAreas, nextStateCode);

      if (!area) {
        throw invalidLocation(
          'ADDRESS_STATE_UNKNOWN',
          'state_code is unknown or inactive for the selected country',
        );
      }

      stateCode = area.code;
      stateText = null;
    }
    else {
      stateCode = nextStateCode;
    }
  }

  if (hasStateText) {
    const nextStateText = normalizeText(selection.stateText);

    if (nextStateText === null) {
      stateText = null;
    }
    else {
      if (stateCode !== null) {
        throw invalidLocation(
          'ADDRESS_STATE_TEXT_NOT_ALLOWED',
          'state_text cannot be combined with state_code',
        );
      }

      if (!countryCode) {
        throw invalidLocation(
          'ADDRESS_COUNTRY_CODE_REQUIRED',
          'state_text requires a country_code',
        );
      }

      const availableAreas = await loadAreas();

      // A preserved legacy label may be resubmitted unchanged; a new label is
      // only valid for a country with no area list.
      if (
        availableAreas.length > 0
        && !sameText(nextStateText, existing.stateText)
      ) {
        throw invalidLocation(
          'ADDRESS_STATE_TEXT_NOT_ALLOWED',
          'state_text is not allowed when the country publishes administrative areas',
        );
      }

      stateText = nextStateText;
    }
  }

  if (!countryCode) {
    throw invalidLocation(
      'ADDRESS_COUNTRY_CODE_REQUIRED',
      'country_code is required',
    );
  }

  const availableAreas = await loadAreas();

  if (availableAreas.length > 0) {
    if (stateCode === null && stateText === null) {
      throw invalidLocation(
        'ADDRESS_STATE_CODE_REQUIRED',
        'state_code is required for the selected country',
      );
    }
  }
  else if (stateCode !== null && (hasStateCode || countryChanged)) {
    throw invalidLocation(
      'ADDRESS_STATE_CODE_NOT_ALLOWED',
      'state_code is not allowed for the selected country',
    );
  }

  if (stateCode !== null && stateText !== null) {
    throw invalidLocation(
      'ADDRESS_STATE_TEXT_NOT_ALLOWED',
      'state_text cannot be combined with state_code',
    );
  }

  return {
    countryCode,
    stateCode,
    countryText: null,
    stateText,
  };
}


function invalidLocation(code: string, message: string): AddressLocationError {
  return new AddressLocationError(code, message);
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

function findArea(
  areas: LocationAdministrativeArea[],
  stateCode: string,
): LocationAdministrativeArea | undefined {
  return areas.find((area) => sameCode(area.code, stateCode));
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