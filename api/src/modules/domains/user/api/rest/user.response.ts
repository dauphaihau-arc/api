import type { PaginatedResult } from '~/common/application/pagination';
import type { UserSummary } from '../../app/user.types';

export type UserResponse = {
  id: string;
  version: number;
  email: string;
  display_name?: string;
  avatar?: string;
  status: string;
};

export type UserListResponse = {
  items: UserResponse[];
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next_page: boolean;
    has_previous_page: boolean;
  };
};

export function toUserResponse(user: UserSummary): UserResponse {
  return {
    id: user.id,
    version: user.version,
    email: user.email,
    display_name: user.displayName,
    avatar: user.avatar,
    status: user.status,
  };
}

export function toUserListResponse(result: PaginatedResult<UserSummary>): UserListResponse {
  return {
    items: result.items.map(toUserResponse),
    meta: {
      page: result.meta.page,
      limit: result.meta.limit,
      total: result.meta.total,
      total_pages: result.meta.totalPages,
      has_next_page: result.meta.hasNextPage,
      has_previous_page: result.meta.hasPreviousPage,
    },
  };
}
