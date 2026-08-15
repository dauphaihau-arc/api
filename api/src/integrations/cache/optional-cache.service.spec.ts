import type { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';
import { OptionalCacheService } from './optional-cache.service';

describe('OptionalCacheService', () => {
  function buildService(values: Record<string, string | undefined> = {}) {
    const cacheManager: Pick<jest.Mocked<Cache>, 'get' | 'set'> = {
      get: jest.fn().mockResolvedValue('cached-value'),
      set: jest.fn().mockResolvedValue('cached-value'),
    };
    const configService: Pick<ConfigService, 'get'> = {
      get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
    };

    return {
      cacheManager,
      service: new OptionalCacheService(
        cacheManager as unknown as Cache,
        configService as unknown as ConfigService,
      ),
    };
  }

  it('reads and writes when global and scope cache flags are enabled', async () => {
    const { cacheManager, service } = buildService();

    await expect(service.get('user.by-id', 'user:user-1')).resolves.toBe('cached-value');
    await service.set('user.by-id', 'user:user-1', { id: 'user-1' }, 60_000);

    expect(cacheManager.get).toHaveBeenCalledWith('user:user-1');
    expect(cacheManager.set).toHaveBeenCalledWith(
      'user:user-1',
      { id: 'user-1' },
      60_000,
    );
  });

  it('skips reads and writes when global optional caching is disabled', async () => {
    const { cacheManager, service } = buildService({ CACHE_ENABLED: 'false' });

    await expect(service.get('user.by-id', 'user:user-1')).resolves.toBeUndefined();
    await service.set('user.by-id', 'user:user-1', { id: 'user-1' });

    expect(cacheManager.get).not.toHaveBeenCalled();
    expect(cacheManager.set).not.toHaveBeenCalled();
  });

  it('skips reads and writes when a scoped optional cache is disabled', async () => {
    const { cacheManager, service } = buildService({ USER_CACHE_ENABLED: 'false' });

    await expect(service.get('user.by-id', 'user:user-1')).resolves.toBeUndefined();
    await service.set('user.by-id', 'user:user-1', { id: 'user-1' });

    expect(cacheManager.get).not.toHaveBeenCalled();
    expect(cacheManager.set).not.toHaveBeenCalled();
  });

});
