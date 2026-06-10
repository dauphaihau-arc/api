import type { UserAddressSummary } from '../app/user-address.types';
import { UserAddressEntity } from './persistence/entities/user-address.entity';

export function toUserAddressSummary(address: UserAddressEntity): UserAddressSummary {
  return {
    id: address.id,
    userId: address.user.id,
    fullName: address.fullName,
    address1: address.address1,
    address2: address.address2,
    city: address.city,
    state: address.state,
    zip: address.zip,
    country: address.country,
    phone: address.phone,
    isPrimary: address.isPrimary,
    createdAt: address.createdAt,
    updatedAt: address.updatedAt,
  };
}
