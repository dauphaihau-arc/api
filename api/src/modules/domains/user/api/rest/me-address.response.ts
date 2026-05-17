import type {
  UserAddressListResult,
  UserAddressSummary
} from '../../app/user-address.types';

export function toMyAddressResponse(address: UserAddressSummary) {
  return {
    id: address.id,
    user: address.userId,
    full_name: address.fullName,
    address_1: address.address1,
    ...(address.address2 ? { address_2: address.address2 } : {}),
    city: address.city,
    state: address.state,
    zip: address.zip,
    country: address.country,
    phone: address.phone,
    is_primary: address.isPrimary,
    created_at: address.createdAt,
    updated_at: address.updatedAt,
  };
}

export function toMyAddressListResponse(result: UserAddressListResult) {
  return {
    results: result.results.map(toMyAddressResponse),
    page: result.page,
    limit: result.limit,
    total_pages: result.totalPages,
    total_results: result.totalResults,
  };
}
