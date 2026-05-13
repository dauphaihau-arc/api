import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Cache } from 'cache-manager';
import { buildUserByIdCacheKey } from '../../modules/domains/user/app/user-cache.keys';
import { UserUpdatedEvent } from '../events/user-updated.event';

@Injectable()
export class InvalidateUserCacheOnUserUpdatedListener {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
  ) {}

  @OnEvent('user.updated', { async: true, suppressErrors: true })
  async handle(event: UserUpdatedEvent): Promise<void> {
    await this.cacheManager.del(buildUserByIdCacheKey(event.userId));
  }
}
