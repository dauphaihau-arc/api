export interface LocationDatasetVersion {
  version: string;
  checksum: string;
}

export interface LocationCountry {
  code: string;
  name: string;
  hasAdministrativeAreas: boolean;
  postalCodeRequired: boolean;
}

export interface LocationAdministrativeArea {
  code: string;
  name: string;
}

export interface LocationCountriesView {
  version: string;
  checksum: string;
  countries: LocationCountry[];
}

export interface LocationAdministrativeAreasView {
  version: string;
  checksum: string;
  areas: LocationAdministrativeArea[];
}

/** Address-form fields the persisted Arc contract supports. */
export type AddressRuleFieldKey =
  | 'full_name'
  | 'address_1'
  | 'address_2'
  | 'city'
  | 'subdivision'
  | 'zip'
  | 'phone';

export type AddressRuleControl = 'text' | 'select' | 'tel';

export interface AddressRuleField {
  key: AddressRuleFieldKey;
  label: string;
  visible: boolean;
  required: boolean;
  control: AddressRuleControl;
  autocomplete: string;
}

/**
 * Arc-owned deltas on top of the `lib-address/lite` defaults. Only these
 * values are persisted; the merged rules themselves are never stored.
 */
export interface CountryAddressRuleOverride {
  order?: AddressRuleFieldKey[];
  labels?: Partial<Record<AddressRuleFieldKey, string>>;
  hidden?: AddressRuleFieldKey[];
}

export interface CountryAddressRules {
  countryCode: string;
  fields: AddressRuleField[];
}

export interface CountryAddressRulesView {
  version: string;
  checksum: string;
  rules: CountryAddressRules;
}
