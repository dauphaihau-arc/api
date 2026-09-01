import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
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
    const userRepository = this.entityManager.fork().getRepository(UserEntity);
    const [users, total] = await userRepository.findAndCount({}, {
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
      orderBy: {
        [USER_SORT_FIELD_MAP[query.sort.field]]: query.sort.direction,
      },
    });

    return {
      items: users.map((user) => this.toSummary(user)),
      total,
    };
  }

  async findById(id: string): Promise<UserSummary | null> {
    const userRepository = this.entityManager.fork().getRepository(UserEntity);
    const user = await userRepository.findOne({ id });

    return user ? this.toSummary(user) : null;
  }

  private toSummary(user: UserEntity): UserSummary {
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
    };
  }
}
