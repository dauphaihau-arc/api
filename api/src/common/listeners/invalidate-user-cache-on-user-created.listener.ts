import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Cache } from 'cache-manager';
import { buildUserByIdCacheKey } from '../../modules/domains/user/app/user-cache.keys';
import { UserCreatedEvent } from '../events/user-created.event';

@Injectable()
export class InvalidateUserCacheOnUserCreatedListener {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
  ) {}

  @OnEvent('user.created', { async: true, suppressErrors: true })
  async handle(event: UserCreatedEvent): Promise<void> {
    await this.cacheManager.del(buildUserByIdCacheKey(event.userId));
  }
}
