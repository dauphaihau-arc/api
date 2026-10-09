import type {
  UserAddressListSort,
  UserAddressListSortField,
} from '../../../app/user-address.types';

export const USER_ADDRESS_LIST_DEFAULT_PAGE = 1;
export const USER_ADDRESS_LIST_DEFAULT_LIMIT = 20;
export const USER_ADDRESS_LIST_MAX_LIMIT = 100;
export const USER_ADDRESS_LIST_SORT_FIELDS: readonly UserAddressListSortField[] = [
  'isPrimary',
  'updatedAt',
  'createdAt',
];
export const DEFAULT_USER_ADDRESS_LIST_SORT: UserAddressListSort = { field: 'isPrimary', direction: 'desc' };
