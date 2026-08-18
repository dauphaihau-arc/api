import { NoopKeyvStore } from '~/integrations/cache/noop-keyv.store';
import {
  buildCacheConfig,
  buildCacheModuleOptions,
} from './cache.config';

describe('buildCacheConfig', () => {
  function buildConfig(values: Record<string, string | undefined>) {
    return buildCacheConfig({
      get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
    });
  }

  it('uses memory cache by default in test', () => {
    expect(buildConfig({ NODE_ENV: 'test' }).driver).toBe('memory');
  });

  it('uses redis cache by default outside test', () => {
    expect(buildConfig({ NODE_ENV: 'production' }).driver).toBe('redis');
  });

  it('supports disabled cache driver and optional cache toggles', () => {
    const config = buildConfig({
      CACHE_DRIVER: 'disabled',
      CACHE_ENABLED: 'false',
      USER_CACHE_ENABLED: 'false',
      CATEGORY_TAXONOMY_CACHE_ENABLED: 'false',
      STOREFRONT_PUBLIC_RESPONSE_CACHE_ENABLED: 'false',
      STOREFRONT_RARE_PRICE_CACHE_ENABLED: 'false',
    });

    expect(config.driver).toBe('disabled');
    expect(config.optionalCacheEnabled).toBe(false);
    expect(config.optionalCacheScopes).toEqual({
      'category.taxonomy-subtree': false,
      'storefront.public-products': false,
      'storefront.rare-price': false,
      'user.by-id': false,
    });
  });
});

describe('buildCacheModuleOptions', () => {
  it('uses a noop store when cache driver is disabled', () => {
    const options = buildCacheModuleOptions({
      driver: 'disabled',
      redisUrl: 'redis://127.0.0.1:6379',
      ttlMilliseconds: 60_000,
      optionalCacheEnabled: false,
      optionalCacheScopes: {
        'category.taxonomy-subtree': false,
        'storefront.public-products': false,
        'storefront.rare-price': false,
        'user.by-id': false,
      },
    });

    expect(options.stores).toEqual([expect.any(NoopKeyvStore)]);
  });
});
