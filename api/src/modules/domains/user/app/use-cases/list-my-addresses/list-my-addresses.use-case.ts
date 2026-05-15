import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { UserAddressRepository } from '../../ports/user-address.repository';
import type {
  ListMyAddressesQuery,
  UserAddressListResult
} from '../../user-address.types';

@Injectable()
export class ListMyAddressesUseCase {
  constructor(
    private readonly userAddressRepository: UserAddressRepository
  ) {}

  async execute(
    actor: AuthenticatedUser,
    query: ListMyAddressesQuery
  ): Promise<UserAddressListResult> {
    const result = await this.userAddressRepository.findAllOwnedByUserId(
      actor.userId,
      query
    );

    return {
      results: result.items,
      page: query.page,
      limit: query.limit,
      totalPages: result.total === 0 ? 0 : Math.ceil(result.total / query.limit),
      totalResults: result.total,
    };
  }
}
