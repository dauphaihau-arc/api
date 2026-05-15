import type {
  CreateMyAddressInput,
  ListMyAddressesQuery,
  ListMyAddressesRepositoryResult,
  UpdateMyAddressInput,
  UserAddressSummary
} from '../user-address.types';

export abstract class UserAddressRepository {
  abstract findAllOwnedByUserId(
    userId: string,
    query: ListMyAddressesQuery
  ): Promise<ListMyAddressesRepositoryResult>;

  abstract findOwnedById(
    userId: string,
    addressId: string
  ): Promise<UserAddressSummary | null>;

  abstract countOwnedByUserId(userId: string): Promise<number>;

  abstract clearPrimaryForUser(
    userId: string,
    excludeAddressId?: string
  ): Promise<void>;

  abstract create(input: CreateMyAddressInput): Promise<UserAddressSummary>;

  abstract updateOwnedById(
    userId: string,
    addressId: string,
    input: UpdateMyAddressInput
  ): Promise<UserAddressSummary | null>;

  abstract deleteOwnedById(
    userId: string,
    addressId: string
  ): Promise<boolean>;
}
