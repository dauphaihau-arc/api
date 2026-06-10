import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { UserAddressQueryRepository } from '../app/ports/user-address-query.repository';
import type {
  ListMyAddressesQuery,
  ListMyAddressesRepositoryResult,
  UserAddressSummary,
} from '../app/user-address.types';
import { UserAddressEntity } from './persistence/entities/user-address.entity';
import { toUserAddressSummary } from './user-address-summary.mapper';

const USER_ADDRESS_SORT_FIELD_MAP = {
  isPrimary: 'isPrimary',
  updatedAt: 'updatedAt',
  createdAt: 'createdAt',
} as const;

@Injectable()
export class MikroOrmUserAddressQueryRepository implements UserAddressQueryRepository {
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
      items: addresses.map(toUserAddressSummary),
      total,
    };
  }

  async findOwnedById(
    userId: string,
    addressId: string
  ): Promise<UserAddressSummary | null> {
    const repository = this.entityManager.fork().getRepository(UserAddressEntity);
    const address = await repository.findOne({ id: addressId, user: userId });

    return address ? toUserAddressSummary(address) : null;
  }

  countOwnedByUserId(userId: string): Promise<number> {
    return this.entityManager
      .fork()
      .getRepository(UserAddressEntity)
      .count({ user: userId });
  }
}
