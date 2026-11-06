import { EntityManager, type FilterQuery } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { UserAddressCommandRepository } from '../app/ports/user-address-command.repository';
import type {
  CreateMyAddressInput,
  UpdateMyAddressInput,
  UserAddressLocationSnapshot,
  UserAddressSummary,
} from '../app/user-address.types';
import { UserAddressEntity } from './persistence/entities/user-address.entity';
import { loadUserAddressLocationDisplays } from './user-address-location-display';
import { toUserAddressSummary } from './user-address-summary.mapper';

@Injectable()
export class MikroOrmUserAddressCommandRepository implements UserAddressCommandRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async clearPrimaryForUser(
    userId: string,
    excludeAddressId?: string,
  ): Promise<void> {
    const where: FilterQuery<UserAddressEntity> = {
      user: userId,
      isPrimary: true,
    };

    if (excludeAddressId) {
      where.id = { $ne: excludeAddressId };
    }

    await this.entityManager.fork().nativeUpdate(
      UserAddressEntity,
      where,
      { isPrimary: false },
    );
  }

  async create(input: CreateMyAddressInput): Promise<UserAddressSummary> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(UserAddressEntity);
    const address = repository.create({
      user: entityManager.getReference(UserEntity, input.userId),
      fullName: input.fullName,
      address1: input.address1,
      address2: input.address2,
      city: input.city,
      zip: input.zip,
      countryCode: input.countryCode,
      stateCode: input.stateCode,
      stateText: input.stateText,
      phone: input.phone,
      isPrimary: input.isPrimary ?? false,
    });

    await entityManager.persistAndFlush(address);
    const displayFor = await loadUserAddressLocationDisplays(entityManager, [address]);

    return toUserAddressSummary(address, displayFor(address));
  }

  async updateOwnedById(
    userId: string,
    addressId: string,
    input: UpdateMyAddressInput,
  ): Promise<UserAddressSummary | null> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(UserAddressEntity);
    const address = await repository.findOne({
      id: addressId,
      user: userId,
    });

    if (!address) {
      return null;
    }

    if (input.fullName !== undefined) address.fullName = input.fullName;
    if (input.address1 !== undefined) address.address1 = input.address1;
    if (input.address2 !== undefined) address.address2 = input.address2;
    if (input.city !== undefined) address.city = input.city;
    if (input.zip !== undefined) address.zip = input.zip;
    if (input.countryCode !== undefined) address.countryCode = input.countryCode;
    if (input.stateCode !== undefined) address.stateCode = input.stateCode;
    if (input.countryText !== undefined) address.countryText = input.countryText;
    if (input.stateText !== undefined) address.stateText = input.stateText;
    if (input.phone !== undefined) address.phone = input.phone;
    if (input.isPrimary !== undefined) address.isPrimary = input.isPrimary;

    await entityManager.persistAndFlush(address);
    const displayFor = await loadUserAddressLocationDisplays(entityManager, [address]);

    return toUserAddressSummary(address, displayFor(address));
  }

  async findOwnedLocationById(
    userId: string,
    addressId: string,
  ): Promise<UserAddressLocationSnapshot | null> {
    const repository = this.entityManager
      .fork()
      .getRepository(UserAddressEntity);
    const address = await repository.findOne({
      id: addressId,
      user: userId,
    });

    if (!address) {
      return null;
    }

    return {
      countryCode: address.countryCode ?? null,
      stateCode: address.stateCode ?? null,
      countryText: address.countryText ?? null,
      stateText: address.stateText ?? null,
      phone: address.phone,
      zip: address.zip,
    };
  }

  async deleteOwnedById(
    userId: string,
    addressId: string,
  ): Promise<boolean> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(UserAddressEntity);
    const address = await repository.findOne({
      id: addressId,
      user: userId,
    });

    if (!address) {
      return false;
    }

    await entityManager.removeAndFlush(address);

    return true;
  }
}
