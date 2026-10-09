import {
  NOTIFICATION_LIST_DEFAULT_LIMIT,
  NOTIFICATION_LIST_DEFAULT_PAGE,
} from './notification.constants';
import type { ListMyNotificationsQuery } from '../../app/notification.types';

export function buildListMyNotificationsQuery(input?: Partial<ListMyNotificationsQuery>): ListMyNotificationsQuery {
  return {
    page: input?.page ?? NOTIFICATION_LIST_DEFAULT_PAGE,
    limit: input?.limit ?? NOTIFICATION_LIST_DEFAULT_LIMIT,
  };
}
