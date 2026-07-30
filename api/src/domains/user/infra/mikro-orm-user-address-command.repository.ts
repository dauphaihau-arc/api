import { EntityManager, type FilterQuery } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { CurrentUserEntity } from '../../auth/infra/persistence/entities/current-user.entity';
import { UserAddressCommandRepository } from '../app/ports/user-address-command.repository';
import type {
  CreateMyAddressInput,
  UpdateMyAddressInput,
  UserAddressSummary,
} from '../app/user-address.types';
import { UserAddressEntity } from './persistence/entities/user-address.entity';
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
      user: entityManager.getReference(CurrentUserEntity, input.userId),
      fullName: input.fullName,
      address1: input.address1,
      address2: input.address2,
      city: input.city,
      state: input.state,
      zip: input.zip,
      country: input.country,
      phone: input.phone,
      isPrimary: input.isPrimary ?? false,
    });

    await entityManager.persistAndFlush(address);

    return toUserAddressSummary(address);
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
    if (input.state !== undefined) address.state = input.state;
    if (input.zip !== undefined) address.zip = input.zip;
    if (input.country !== undefined) address.country = input.country;
    if (input.phone !== undefined) address.phone = input.phone;
    if (input.isPrimary !== undefined) address.isPrimary = input.isPrimary;

    await entityManager.persistAndFlush(address);

    return toUserAddressSummary(address);
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
