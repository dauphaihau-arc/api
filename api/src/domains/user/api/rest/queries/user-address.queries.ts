import {
  DEFAULT_USER_ADDRESS_LIST_SORT,
  USER_ADDRESS_LIST_DEFAULT_LIMIT,
  USER_ADDRESS_LIST_DEFAULT_PAGE,
} from './user-address.constants';
import type { ListMyAddressesQuery } from '../../../app/user-address.types';

export function buildListMyAddressesQuery(params: Partial<ListMyAddressesQuery>): ListMyAddressesQuery {
  return {
    page: params.page ?? USER_ADDRESS_LIST_DEFAULT_PAGE,
    limit: params.limit ?? USER_ADDRESS_LIST_DEFAULT_LIMIT,
    sort: params.sort ?? DEFAULT_USER_ADDRESS_LIST_SORT,
  };
}
