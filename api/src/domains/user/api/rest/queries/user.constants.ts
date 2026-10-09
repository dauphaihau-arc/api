import type { UserListSort, UserListSortField } from '../../../app/user.types';

export const USER_LIST_DEFAULT_PAGE = 1;
export const USER_LIST_DEFAULT_LIMIT = 20;
export const USER_LIST_MAX_LIMIT = 100;
export const USER_LIST_SORT_FIELDS: readonly UserListSortField[] = [
  'createdAt',
  'email',
  'displayName',
  'status',
];
export const DEFAULT_USER_LIST_SORT: UserListSort = { field: 'createdAt', direction: 'desc' };
