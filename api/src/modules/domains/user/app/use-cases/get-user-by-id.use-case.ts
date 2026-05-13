import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { UserRepository } from '../ports/user.repository';
import type { UserSummary } from '../user.types';
import { buildUserByIdCacheKey } from '../user-cache.keys';

@Injectable()
export class GetUserByIdUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
  ) {}

  async execute(id: string): Promise<UserSummary | null> {
    const cacheKey = buildUserByIdCacheKey(id);
    const cachedUser = await this.cacheManager.get<UserSummary>(cacheKey);

    if (cachedUser) {
      return cachedUser;
    }

    const user = await this.userRepository.findById(id);

    if (user) {
      await this.cacheManager.set(cacheKey, user);
    }

    return user;
  }
}
