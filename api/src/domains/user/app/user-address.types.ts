import type { SortOption } from '~/platform/application/sort';

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
  phone: string;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

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

export interface CreateMyAddressInput {
  userId: string;
  fullName: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
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
  phone?: string;
  isPrimary?: boolean;
}
