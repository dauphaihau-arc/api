import type { SortOption } from '~/common/application/sort';

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

export const USER_ADDRESS_LIST_DEFAULT_PAGE = 1;
export const USER_ADDRESS_LIST_DEFAULT_LIMIT = 20;
export const USER_ADDRESS_LIST_MAX_LIMIT = 100;
export const USER_ADDRESS_LIST_SORT_FIELDS = [
  'isPrimary',
  'updatedAt',
  'createdAt',
] as const;

export type UserAddressListSortField = typeof USER_ADDRESS_LIST_SORT_FIELDS[number];
export type UserAddressListSort = SortOption<UserAddressListSortField>;

export const DEFAULT_USER_ADDRESS_LIST_SORT: UserAddressListSort = {
  field: 'isPrimary',
  direction: 'desc',
};

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

export function buildListMyAddressesQuery(
  params: Partial<ListMyAddressesQuery>,
): ListMyAddressesQuery {
  return {
    page: params.page ?? USER_ADDRESS_LIST_DEFAULT_PAGE,
    limit: params.limit ?? USER_ADDRESS_LIST_DEFAULT_LIMIT,
    sort: params.sort ?? DEFAULT_USER_ADDRESS_LIST_SORT,
  };
}
