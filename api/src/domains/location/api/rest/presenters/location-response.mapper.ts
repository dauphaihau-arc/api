import type {
  AddressRuleField,
  LocationAdministrativeArea,
  LocationCountry,
  CountryAddressRules,
} from '../../../app/location.types';
import type {
  LocationAddressRuleResponseDto,
  LocationAdministrativeAreaResponseDto,
  LocationCountryAddressRulesResponseDto,
  LocationCountryResponseDto,
} from '../responses/location-response.dto';

export const toLocationCountryResponse = (
  country: LocationCountry,
): LocationCountryResponseDto => ({
  code: country.code,
  name: country.name,
  has_administrative_areas: country.hasAdministrativeAreas,
  postal_code_required: country.postalCodeRequired,
});

export const toLocationAdministrativeAreaResponse = (
  area: LocationAdministrativeArea,
): LocationAdministrativeAreaResponseDto => ({
  code: area.code,
  name: area.name,
});

export const toLocationAddressRuleResponse = (
  field: AddressRuleField,
): LocationAddressRuleResponseDto => ({
  key: field.key,
  label: field.label,
  visible: field.visible,
  required: field.required,
  control: field.control,
  autocomplete: field.autocomplete,
});

export const toLocationCountryAddressRulesResponse = (
  rules: CountryAddressRules,
): LocationCountryAddressRulesResponseDto => ({
  country_code: rules.countryCode,
  fields: rules.fields.map(toLocationAddressRuleResponse),
});
