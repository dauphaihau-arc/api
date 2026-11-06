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
