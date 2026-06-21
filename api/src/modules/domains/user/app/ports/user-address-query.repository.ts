import type {
  ListMyAddressesQuery,
  ListMyAddressesRepositoryResult,
  UserAddressSummary,
} from '../user-address.types';

export abstract class UserAddressQueryRepository {
  abstract findAllOwnedByUserId(
    userId: string,
    query: ListMyAddressesQuery
  ): Promise<ListMyAddressesRepositoryResult>;

  abstract findOwnedById(
    userId: string,
    addressId: string
  ): Promise<UserAddressSummary | null>;

  abstract countOwnedByUserId(userId: string): Promise<number>;
}
