import { Injectable } from '@nestjs/common';
import { OptionalCacheService } from '~/integrations/cache/optional-cache.service';
import { UserRepository } from '../../ports/user.repository';
import type { UserSummary } from '../../user.types';
import { buildUserByIdCacheKey } from '../../user-cache.keys';

@Injectable()
export class GetUserByIdUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly optionalCacheService: OptionalCacheService,
  ) {}

  async execute(id: string): Promise<UserSummary | null> {
    const cacheKey = buildUserByIdCacheKey(id);
    const cachedUser = await this.optionalCacheService.get<UserSummary>(
      'user.by-id',
      cacheKey,
    );

    if (cachedUser) {
      return cachedUser;
    }

    const user = await this.userRepository.findById(id);

    if (user) {
      await this.optionalCacheService.set('user.by-id', cacheKey, user);
    }

    return user;
  }
}
