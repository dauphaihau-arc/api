import { DEFAULT_USER_LIST_SORT, USER_LIST_DEFAULT_LIMIT, USER_LIST_DEFAULT_PAGE } from './user.constants';
import type { ListUsersQuery } from '../../app/user.types';

export function buildListUsersQuery(params: Partial<ListUsersQuery>): ListUsersQuery {
  return {
    page: params.page ?? USER_LIST_DEFAULT_PAGE,
    limit: params.limit ?? USER_LIST_DEFAULT_LIMIT,
    sort: params.sort ?? DEFAULT_USER_LIST_SORT,
  };
}
