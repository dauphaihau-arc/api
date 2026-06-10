import type {
  CreateMyAddressInput,
  UpdateMyAddressInput,
  UserAddressSummary
} from '../user-address.types';

export abstract class UserAddressCommandRepository {
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
