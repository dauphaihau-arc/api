import { Injectable } from '@nestjs/common';
import { buildPaginationMeta } from '~/platform/application/pagination';
import { UserRepository } from '../../ports/user.repository';
import type { ListUsersQuery, UserListResult } from '../../user.types';

@Injectable()
export class ListUsersUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(query: ListUsersQuery): Promise<UserListResult> {
    const result = await this.userRepository.findAll(query);

    return {
      items: result.items,
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  }
}
