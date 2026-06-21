import type { CacheModuleOptions } from '@nestjs/cache-manager';
import type { ConfigService } from '@nestjs/config';
import KeyvRedis from '@keyv/redis';
import { parseDurationToMilliseconds } from '../libs/duration';

export interface CacheConfig {
  driver: 'memory' | 'redis';
  redisUrl: string;
  ttlMilliseconds: number;
}

export function buildCacheConfig(
  configService: Pick<ConfigService, 'get'>,
): CacheConfig {
  const explicitDriver = configService.get<'memory' | 'redis'>('CACHE_DRIVER');

  return {
    driver:
      explicitDriver ??
      (configService.get<string>('NODE_ENV') === 'test' ? 'memory' : 'redis'),
    redisUrl: configService.get<string>('REDIS_URL', 'redis://127.0.0.1:6379'),
    ttlMilliseconds: parseDurationToMilliseconds(
      configService.get<string>('CACHE_TTL', '60s'),
      60_000,
    ),
  };
}

export function buildCacheModuleOptions(
  cacheConfig: CacheConfig,
): CacheModuleOptions {
  const baseOptions: CacheModuleOptions = {
    isGlobal: true,
    ttl: cacheConfig.ttlMilliseconds,
  };

  if (cacheConfig.driver === 'memory') {
    return baseOptions;
  }

  return {
    ...baseOptions,
    stores: [new KeyvRedis(cacheConfig.redisUrl)],
  };
}
