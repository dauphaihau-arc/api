import type { CacheModuleOptions } from '@nestjs/cache-manager';
import type { ConfigService } from '@nestjs/config';
import KeyvRedis from '@keyv/redis';
import { parseDurationToMilliseconds } from '~/shared/libs/duration';
import { NoopKeyvStore } from '~/integrations/cache/noop-keyv.store';

export type CacheDriver = 'memory' | 'redis' | 'disabled';
export type OptionalCacheScope =
  | 'storefront.public-products'
  | 'storefront.rare-price'
  | 'user.by-id';

export interface CacheConfig {
  driver: CacheDriver;
  redisUrl: string;
  ttlMilliseconds: number;
  optionalCacheEnabled: boolean;
  optionalCacheScopes: Record<OptionalCacheScope, boolean>;
}

export function buildCacheConfig(
  configService: Pick<ConfigService, 'get'>,
): CacheConfig {
  const explicitDriver = configService.get<CacheDriver>('CACHE_DRIVER');
  const nodeEnv = configService.get<string>('NODE_ENV');

  return {
    driver:
      explicitDriver ??
      (nodeEnv === 'test' ? 'memory' : 'redis'),

    redisUrl: configService.get<string>('REDIS_URL', 'redis://127.0.0.1:6379'),

    ttlMilliseconds: parseDurationToMilliseconds(
      configService.get<string>('CACHE_TTL', '60s'),
      60_000,
    ),

    optionalCacheEnabled: configService.get<string>('CACHE_ENABLED', 'true') !== 'false',

    optionalCacheScopes: {
      'storefront.public-products': configService.get<string>(
        'STOREFRONT_PUBLIC_RESPONSE_CACHE_ENABLED',
        'true',
      ) !== 'false',
      'storefront.rare-price': configService.get<string>(
        'STOREFRONT_RARE_PRICE_CACHE_ENABLED',
        'true',
      ) !== 'false',
      'user.by-id': configService.get<string>('USER_CACHE_ENABLED', 'true') !== 'false',
    },
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

  if (cacheConfig.driver === 'disabled') {
    return {
      ...baseOptions,
      stores: [new NoopKeyvStore()],
    };
  }

  return {
    ...baseOptions,
    stores: [new KeyvRedis(cacheConfig.redisUrl)],
  };
}
