import { Injectable } from '@nestjs/common';
import { UserAddressCommandRepository } from '../app/ports/user-address-command.repository';
import { UserAddressQueryRepository } from '../app/ports/user-address-query.repository';
import { UserAddressRepository } from '../app/ports/user-address.repository';
import type {
  CreateMyAddressInput,
  ListMyAddressesQuery,
  ListMyAddressesRepositoryResult,
  UpdateMyAddressInput,
  UserAddressSummary,
} from '../app/user-address.types';

@Injectable()
export class DelegatingUserAddressRepository implements UserAddressRepository {
  constructor(
    private readonly commandRepository: UserAddressCommandRepository,
    private readonly queryRepository: UserAddressQueryRepository
  ) {}

  findAllOwnedByUserId(
    userId: string,
    query: ListMyAddressesQuery
  ): Promise<ListMyAddressesRepositoryResult> {
    return this.queryRepository.findAllOwnedByUserId(userId, query);
  }

  findOwnedById(
    userId: string,
    addressId: string
  ): Promise<UserAddressSummary | null> {
    return this.queryRepository.findOwnedById(userId, addressId);
  }

  countOwnedByUserId(userId: string): Promise<number> {
    return this.queryRepository.countOwnedByUserId(userId);
  }

  clearPrimaryForUser(
    userId: string,
    excludeAddressId?: string
  ): Promise<void> {
    return this.commandRepository.clearPrimaryForUser(userId, excludeAddressId);
  }

  create(input: CreateMyAddressInput): Promise<UserAddressSummary> {
    return this.commandRepository.create(input);
  }

  updateOwnedById(
    userId: string,
    addressId: string,
    input: UpdateMyAddressInput
  ): Promise<UserAddressSummary | null> {
    return this.commandRepository.updateOwnedById(userId, addressId, input);
  }

  deleteOwnedById(userId: string, addressId: string): Promise<boolean> {
    return this.commandRepository.deleteOwnedById(userId, addressId);
  }
}
