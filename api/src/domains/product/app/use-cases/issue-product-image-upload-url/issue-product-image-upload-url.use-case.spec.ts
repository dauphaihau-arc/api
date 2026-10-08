import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Cache } from 'cache-manager';
import type { StorageConfig } from '~/platform/config/storage.config';
import type { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { ProductImageAssetType } from '../../../domain/enums/product-image-asset-type.enum';
import { ProductState } from '../../../domain/enums/product-state.enum';
import { ProductWhoMade } from '../../../domain/enums/product-who-made.enum';
import type { ProductDraftSummary } from '../../product.types';
import { IssueProductImageUploadUrlUseCase } from './issue-product-image-upload-url.use-case';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('IssueProductImageUploadUrlUseCase', () => {
  const product: ProductDraftSummary = {
    id: 'product-1',
    publicId: 'productpub01',
    shopId: 'shop-1',
    shopPublicId: 'shoppub0001',
    categoryId: 'category-1',
    title: 'Handmade Mug',
    slug: 'handmade-mug',
    description: 'Wheel-thrown ceramic mug',
    state: ProductState.DRAFT,
    whoMade: ProductWhoMade.I_DID,
    isDigital: false,
    nonTaxable: false,
    images: [],
    attributes: [],
    variants: [],
    inventory: [],
  };

  function buildDeps(storageConfig: StorageConfig = {
    driver: 'local',
    localRoot: '/tmp/storage',
  }) {
    const cacheStore = new Map<string, unknown>();
    const cacheManager = {
      get: jest.fn(async (key: string) => cacheStore.get(key)),
      set: jest.fn(async (key: string, value: unknown) => {
        cacheStore.set(key, value);
      }),
    } as unknown as Pick<Cache, 'get' | 'set'>;

    const storageService: jest.Mocked<StorageService> = {
      putObject: jest.fn(),
      getObject: jest.fn(),
      exists: jest.fn(),
      getPublicUrl: jest.fn(),
      deleteObject: jest.fn(),
      ping: jest.fn().mockResolvedValue(undefined),
    };

    return {
      cacheManager,
      storageConfig,
      storageService,
    };
  }

  it('issues a local upload ticket when object storage is disabled', async () => {
    const { cacheManager, storageConfig, storageService } = buildDeps();
    const useCase = new IssueProductImageUploadUrlUseCase(
      cacheManager as Cache,
      storageConfig,
      storageService,
    );

    const issued = await useCase.execute(
      product,
      'image/webp',
      ProductImageAssetType.ORIGINAL,
    );

    expect(issued.key).toMatch(
      /shops\/shoppub0001\/products\/productpub01\/images\/[^/]+\/original\.webp$/,
    );
    expect(issued.token).toBeDefined();
    expect(cacheManager.set).toHaveBeenCalledTimes(1);
  });

  it('returns a real presigned URL when object storage is enabled', async () => {
    const mockedGetSignedUrl = jest.mocked(getSignedUrl);
    mockedGetSignedUrl.mockResolvedValueOnce('http://localhost:9000/bucket/signed');

    const { cacheManager, storageConfig, storageService } = buildDeps({
      driver: 'minio',
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      bucket: 'app-files',
      accessKey: 'minioadmin',
      secretKey: 'minioadmin',
      forcePathStyle: true,
      publicBaseUrl: 'http://localhost:9000/app-files',
    });

    const useCase = new IssueProductImageUploadUrlUseCase(
      cacheManager as Cache,
      storageConfig,
      storageService,
    );

    const issued = await useCase.execute(
      product,
      'image/webp',
      ProductImageAssetType.ORIGINAL,
    );

    expect(issued.token).toBeUndefined();
    expect(issued.presignedUrl).toBe('http://localhost:9000/bucket/signed');
    expect(mockedGetSignedUrl).toHaveBeenCalledTimes(1);
    expect(storageService.ping).toHaveBeenCalledTimes(1);
  });
});
