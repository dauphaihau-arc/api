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

export type UserListSortField =
  | 'createdAt'
  | 'email'
  | 'displayName'
  | 'status';
export type UserListSort = SortOption<UserListSortField>;

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
