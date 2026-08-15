import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';
import {
  buildCacheConfig,
  type OptionalCacheScope,
} from '~/platform/config/cache.config';

@Injectable()
export class OptionalCacheService {
  private readonly cacheConfig: ReturnType<typeof buildCacheConfig>;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
  ) {
    this.cacheConfig = buildCacheConfig(this.configService);
  }

  async get<T>(
    scope: OptionalCacheScope,
    key: string,
  ): Promise<T | undefined> {
    if (!this.isEnabled(scope)) {
      return undefined;
    }

    return this.cacheManager.get<T>(key);
  }

  async set<T>(
    scope: OptionalCacheScope,
    key: string,
    value: T,
    ttl?: number,
  ): Promise<void> {
    if (!this.isEnabled(scope)) {
      return;
    }

    await this.cacheManager.set(key, value, ttl);
  }

  isEnabled(scope: OptionalCacheScope): boolean {
    return this.cacheConfig.driver !== 'disabled'
      && this.cacheConfig.optionalCacheEnabled
      && this.cacheConfig.optionalCacheScopes[scope];
  }
}
