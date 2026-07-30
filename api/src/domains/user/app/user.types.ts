import type { PaginatedResult } from '~/platform/application/pagination';
import type { SortOption } from '~/platform/application/sort';
import type { UserStatus } from '../../auth/domain/enums/user-status.enum';

export interface UserSummary {
  id: string;
  version: number;
  email: string;
  displayName?: string;
  avatar?: string;
  status: UserStatus;
}

export const USER_LIST_DEFAULT_PAGE = 1;
export const USER_LIST_DEFAULT_LIMIT = 20;
export const USER_LIST_MAX_LIMIT = 100;
export const USER_LIST_SORT_FIELDS = [
  'createdAt',
  'email',
  'displayName',
  'status',
] as const;

export type UserListSortField = typeof USER_LIST_SORT_FIELDS[number];
export type UserListSort = SortOption<UserListSortField>;

export const DEFAULT_USER_LIST_SORT: UserListSort = {
  field: 'createdAt',
  direction: 'desc',
};

export interface ListUsersQuery {
  page: number;
  limit: number;
  sort: UserListSort;
}

export interface ListUsersRepositoryResult {
  items: UserSummary[];
  total: number;
}

export type UserListResult = PaginatedResult<UserSummary>;

export function buildListUsersQuery(params: Partial<ListUsersQuery>): ListUsersQuery {
  return {
    page: params.page ?? USER_LIST_DEFAULT_PAGE,
    limit: params.limit ?? USER_LIST_DEFAULT_LIMIT,
    sort: params.sort ?? DEFAULT_USER_LIST_SORT,
  };
}
