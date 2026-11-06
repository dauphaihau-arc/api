import type { UserAddressSummary } from '../app/user-address.types';
import type { UserAddressEntity } from './persistence/entities/user-address.entity';
import type { UserAddressLocationDisplay } from './user-address-location-display';

export function toUserAddressSummary(
  address: UserAddressEntity,
  display: UserAddressLocationDisplay,
): UserAddressSummary {
  return {
    id: address.id,
    userId: address.user.id,
    fullName: address.fullName,
    address1: address.address1,
    address2: address.address2,
    city: address.city,
    state: display.state,
    zip: address.zip,
    country: display.country,
    countryCode: address.countryCode ?? null,
    stateCode: address.stateCode ?? null,
    stateText: address.stateText ?? null,
    phone: address.phone,
    isPrimary: address.isPrimary,
    createdAt: address.createdAt,
    updatedAt: address.updatedAt,
  };
}
