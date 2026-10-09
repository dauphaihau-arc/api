import { ShippingProfileStatus } from '../domain/enums/shipping-profile-status.enum';

export const SHIPPING_PROFILE_LIST_DEFAULT_PAGE = 1;
export const SHIPPING_PROFILE_LIST_DEFAULT_LIMIT = 20;
export const SHIPPING_PROFILE_LIST_MAX_LIMIT = 100;

/** Statuses the settings list shows when the caller does not ask for others. */
export const SHIPPING_PROFILE_LIST_STATUSES_WITHOUT_ARCHIVED = [
  ShippingProfileStatus.ACTIVE,
  ShippingProfileStatus.DRAFT,
];
