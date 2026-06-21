import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Cache } from 'cache-manager';
import type { StorageConfig } from '~/config/storage.config';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';
import type { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import { ProductImageAssetType } from '../../../domain/enums/product-image-asset-type.enum';
import type { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import type { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import { IssueProductImageUploadUrlUseCase } from './issue-product-image-upload-url.use-case';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('IssueProductImageUploadUrlUseCase', () => {
  const actor: AuthenticatedUser = {
    userId: 'shop-owner-1',
    email: 'owner@example.com',
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    roles: [],
    permissions: [],
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

    const shopRepository: jest.Mocked<ShopRepository> = {
      create: jest.fn(),
      findById: jest.fn(),
      findByOwnerUserId: jest.fn(),
      findByShopName: jest.fn(),
      findBySlug: jest.fn(),
      findOwnedById: jest.fn().mockResolvedValue({
        id: 'shop-1',
        publicId: 'shoppub0001',
        ownerUserId: actor.userId,
        shopName: 'owner-shop',
        slug: 'owner-shop',
        status: 'active',
      }),
    };

    const productRepository: Pick<jest.Mocked<SellerProductQueryRepository>, 'findById'> = {
      findById: jest.fn().mockResolvedValue({
        id: 'product-1',
        publicId: 'productpub01',
        shopId: 'shop-1',
        shopPublicId: 'shoppub0001',
        categoryId: 'category-1',
        title: 'Handmade Mug',
        slug: 'handmade-mug',
        description: 'Wheel-thrown ceramic mug',
        state: 'draft',
        whoMade: 'i_did',
        isDigital: false,
        nonTaxable: false,
        variantType: 'none',
        images: [],
        attributes: [],
        variants: [],
        inventory: [],
      }),
    };

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
      shopRepository,
      productRepository,
      storageConfig,
      storageService,
    };
  }

  it('issues a local upload ticket when object storage is disabled', async () => {
    const {
      cacheManager, shopRepository, productRepository, storageConfig, storageService,
    } = buildDeps();
    const useCase = new IssueProductImageUploadUrlUseCase(
      cacheManager as Cache,
      shopRepository,
      productRepository as never,
      storageConfig,
      storageService,
    );

    const issued = await useCase.execute(
      actor,
      'shop-1',
      'product-1',
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

    const {
      cacheManager, shopRepository, productRepository, storageConfig, storageService,
    } = buildDeps({
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
      shopRepository,
      productRepository as never,
      storageConfig,
      storageService,
    );

    const issued = await useCase.execute(
      actor,
      'shop-1',
      'product-1',
      'image/webp',
      ProductImageAssetType.ORIGINAL,
    );

    expect(issued.token).toBeUndefined();
    expect(issued.presignedUrl).toBe('http://localhost:9000/bucket/signed');
    expect(mockedGetSignedUrl).toHaveBeenCalledTimes(1);
    expect(storageService.ping).toHaveBeenCalledTimes(1);
  });
});
