import type { FilterQuery } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { isUuid } from '~/platform/ids/uuid';
import { UserRoleEntity } from '~/domains/auth/infra/persistence/entities/user-role.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { UserRepository } from '../app/ports/user.repository';
import type {
  ListUsersQuery,
  ListUsersRepositoryResult,
  UserSummary,
} from '../app/user.types';

const USER_SORT_FIELD_MAP = {
  createdAt: 'createdAt',
  email: 'email',
  displayName: 'displayName',
  status: 'status',
} as const;

@Injectable()
export class MikroOrmUserRepository implements UserRepository {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService,
  ) {}

  async findAll(query: ListUsersQuery): Promise<ListUsersRepositoryResult> {
    const entityManager = this.entityManager.fork();
    const userRepository = entityManager.getRepository(UserEntity);

    const [users, total] = await userRepository.findAndCount(
      this.buildWhere(query.search),
      {
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        orderBy: {
          [USER_SORT_FIELD_MAP[query.sort.field]]: query.sort.direction,
        },
      },
    );

    const rolesByUserId = await this.findRoleKeysByUserIds(
      entityManager,
      users.map((user) => user.id),
    );

    return {
      items: users.map((user) =>
        this.toSummary(user, rolesByUserId.get(user.id) ?? []),
      ),
      total,
    };
  }

  async findById(id: string): Promise<UserSummary | null> {
    const entityManager = this.entityManager.fork();
    const user = await entityManager.getRepository(UserEntity).findOne({ id });

    if (!user) {
      return null;
    }

    const rolesByUserId = await this.findRoleKeysByUserIds(entityManager, [
      user.id,
    ]);

    return this.toSummary(user, rolesByUserId.get(user.id) ?? []);
  }

  private buildWhere(search?: string): FilterQuery<UserEntity> {
    const term = search?.trim();

    if (!term) {
      return {};
    }

    const conditions: FilterQuery<UserEntity>[] = [
      { email: { $ilike: `%${term}%` } },
      { displayName: { $ilike: `%${term}%` } },
    ];

    if (isUuid(term)) {
      conditions.push({ id: term });
    }

    return { $or: conditions };
  }

  private async findRoleKeysByUserIds(
    entityManager: EntityManager,
    userIds: string[],
  ): Promise<Map<string, string[]>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const userRoles = await entityManager.getRepository(UserRoleEntity).find(
      { user: { $in: userIds } },
      { populate: ['role'] },
    );
    const rolesByUserId = new Map<string, string[]>();

    for (const userRole of userRoles) {
      const roles = rolesByUserId.get(userRole.user.id) ?? [];
      roles.push(userRole.role.key);
      rolesByUserId.set(userRole.user.id, roles);
    }

    for (const roles of rolesByUserId.values()) {
      roles.sort((left, right) => left.localeCompare(right));
    }

    return rolesByUserId;
  }

  private toSummary(user: UserEntity, roles: string[]): UserSummary {
    const avatar = user.avatar
      ? this.storageService.getPublicUrl(user.avatar) ?? user.avatar
      : undefined;

    return {
      id: user.id,
      version: user.version,
      email: user.email,
      displayName: user.displayName,
      ...(avatar ? { avatar } : {}),
      status: user.status,
      roles,
    };
  }
}
