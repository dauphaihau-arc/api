import type { SortOption } from '~/platform/application/sort';
import type {
  AddressLocationSelection,
  AddressLocationSnapshot,
} from '~/domains/location/app/address-location.types';

export interface UserAddressSummary {
  id: string;
  userId: string;
  fullName: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  countryCode: string | null;
  stateCode: string | null;
  phone: string;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Internal location state of an owned address, used while validating updates. */
export type UserAddressLocationSnapshot = AddressLocationSnapshot;

export type UserAddressListSortField =
  | 'isPrimary'
  | 'updatedAt'
  | 'createdAt';
export type UserAddressListSort = SortOption<UserAddressListSortField>;

export interface ListMyAddressesQuery {
  page: number;
  limit: number;
  sort: UserAddressListSort;
}

export interface ListMyAddressesRepositoryResult {
  items: UserAddressSummary[];
  total: number;
}

export interface UserAddressListResult {
  results: UserAddressSummary[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

/** Location fields accepted from clients. Codes take precedence over legacy names. */
export type UserAddressLocationSelection = AddressLocationSelection;

/** Create payload before the location selection is resolved. */
export interface CreateMyAddressCommand extends UserAddressLocationSelection {
  fullName: string;
  address1: string;
  address2?: string;
  city: string;
  zip: string;
  phone: string;
  isPrimary?: boolean;
}

/** Update payload before the location selection is resolved. */
export interface UpdateMyAddressCommand extends UserAddressLocationSelection {
  fullName?: string;
  address1?: string;
  address2?: string;
  city?: string;
  zip?: string;
  phone?: string;
  isPrimary?: boolean;
}

export interface CreateMyAddressInput {
  userId: string;
  fullName: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  countryCode: string | null;
  stateCode: string | null;
  countryText: string | null;
  stateText: string | null;
  phone: string;
  isPrimary?: boolean;
}

export interface UpdateMyAddressInput {
  fullName?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  countryCode?: string | null;
  stateCode?: string | null;
  countryText?: string | null;
  stateText?: string | null;
  phone?: string;
  isPrimary?: boolean;
}
