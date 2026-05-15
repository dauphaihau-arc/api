import { EntityManager, type FilterQuery } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { CurrentUserEntity } from '../../auth/infra/persistence/entities/current-user.entity';
import { UserAddressRepository } from '../app/ports/user-address.repository';
import type {
  CreateMyAddressInput,
  ListMyAddressesQuery,
  ListMyAddressesRepositoryResult,
  UpdateMyAddressInput,
  UserAddressSummary
} from '../app/user-address.types';
import { UserAddressEntity } from './persistence/entities/user-address.entity';

const USER_ADDRESS_SORT_FIELD_MAP = {
  isPrimary: 'isPrimary',
  updatedAt: 'updatedAt',
  createdAt: 'createdAt',
} as const;

@Injectable()
export class MikroOrmUserAddressRepository implements UserAddressRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findAllOwnedByUserId(
    userId: string,
    query: ListMyAddressesQuery
  ): Promise<ListMyAddressesRepositoryResult> {
    const repository = this.entityManager.fork().getRepository(UserAddressEntity);
    const [addresses, total] = await repository.findAndCount(
      { user: userId },
      {
        offset: (query.page - 1) * query.limit,
        limit: query.limit,
        orderBy: [
          {
            [USER_ADDRESS_SORT_FIELD_MAP[query.sort.field]]: query.sort.direction,
          },
          { updatedAt: 'desc' },
          { createdAt: 'desc' },
        ],
      }
    );

    return {
      items: addresses.map((address) => this.toSummary(address)),
      total,
    };
  }

  async findOwnedById(
    userId: string,
    addressId: string
  ): Promise<UserAddressSummary | null> {
    const repository = this.entityManager.fork().getRepository(UserAddressEntity);
    const address = await repository.findOne({ id: addressId, user: userId });

    return address ? this.toSummary(address) : null;
  }

  countOwnedByUserId(userId: string): Promise<number> {
    return this.entityManager
      .fork()
      .getRepository(UserAddressEntity)
      .count({ user: userId });
  }

  async clearPrimaryForUser(
    userId: string,
    excludeAddressId?: string
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
      { isPrimary: false }
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

    return this.toSummary(address);
  }

  async updateOwnedById(
    userId: string,
    addressId: string,
    input: UpdateMyAddressInput
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

    if (input.fullName !== undefined) {
      address.fullName = input.fullName;
    }
    if (input.address1 !== undefined) {
      address.address1 = input.address1;
    }
    if (input.address2 !== undefined) {
      address.address2 = input.address2;
    }
    if (input.city !== undefined) {
      address.city = input.city;
    }
    if (input.state !== undefined) {
      address.state = input.state;
    }
    if (input.zip !== undefined) {
      address.zip = input.zip;
    }
    if (input.country !== undefined) {
      address.country = input.country;
    }
    if (input.phone !== undefined) {
      address.phone = input.phone;
    }
    if (input.isPrimary !== undefined) {
      address.isPrimary = input.isPrimary;
    }

    await entityManager.persistAndFlush(address);

    return this.toSummary(address);
  }

  async deleteOwnedById(
    userId: string,
    addressId: string
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

  private toSummary(address: UserAddressEntity): UserAddressSummary {
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
}
