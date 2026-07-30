import type { Cache } from 'cache-manager';
import type { StorageConfig } from '~/platform/config/storage.config';
import type { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { ConsumeProductImageUploadTicketUseCase } from './consume-product-image-upload-ticket.use-case';
import { buildTicketCacheKey } from '../issue-product-image-upload-url/issue-product-image-upload-url.use-case';

describe('ConsumeProductImageUploadTicketUseCase', () => {
  function buildDeps(storageConfig: StorageConfig = {
    driver: 'local',
    localRoot: '/tmp/storage',
  }) {
    const cacheStore = new Map<string, unknown>();
    const cacheManager: Pick<Cache, 'get' | 'del'> = {
      get: (jest.fn(async (key: string) => cacheStore.get(key)) as unknown) as Cache['get'],
      del: (jest.fn(async (key: string) => {
        cacheStore.delete(key);
        return true;
      }) as unknown) as Cache['del'],
    };

    const storageService: jest.Mocked<StorageService> = {
      putObject: jest.fn().mockResolvedValue({
        key: 'products/tmp/shop-1/uploaded-key',
        size: 3,
        contentType: 'image/jpeg',
      }),
      getObject: jest.fn(),
      deleteObject: jest.fn(),
      exists: jest.fn(),
      getPublicUrl: jest.fn(),
      ping: jest.fn(),
    };

    cacheStore.set(buildTicketCacheKey('ticket-1'), {
      shopId: 'shop-1',
      storageKey: 'products/tmp/shop-1/uploaded-key',
    });

    return {
      cacheManager,
      storageService,
      storageConfig,
    };
  }

  it('stores uploaded image bytes using a valid ticket', async () => {
    const { cacheManager, storageService, storageConfig } = buildDeps();
    const useCase = new ConsumeProductImageUploadTicketUseCase(
      cacheManager as Cache,
      storageService,
      storageConfig,
    );

    const uploaded = await useCase.execute(
      'ticket-1',
      Buffer.from('img'),
      'image/jpeg',
    );

    expect(uploaded.key).toBe('products/tmp/shop-1/uploaded-key');
    expect(storageService.putObject).toHaveBeenCalledWith({
      key: 'products/tmp/shop-1/uploaded-key',
      body: Buffer.from('img'),
      contentType: 'image/jpeg',
    });
    expect(cacheManager.del).toHaveBeenCalledTimes(1);
  });

  it('rejects non-image uploads', async () => {
    const { cacheManager, storageService, storageConfig } = buildDeps();
    const useCase = new ConsumeProductImageUploadTicketUseCase(
      cacheManager as Cache,
      storageService,
      storageConfig,
    );

    await expect(
      useCase.execute('ticket-1', Buffer.from('img'), 'application/pdf'),
    ).rejects.toThrow('Upload content type must be an image');
  });
});
