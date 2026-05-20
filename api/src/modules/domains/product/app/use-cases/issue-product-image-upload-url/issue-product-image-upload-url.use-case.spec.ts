import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Cache } from 'cache-manager';
import type { StorageConfig } from '~/config/storage.config';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';
import type { ProductRepository } from '../../ports/product.repository';
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
    const cacheManager: Pick<Cache, 'get' | 'set'> = {
      get: jest.fn(async (key: string) => cacheStore.get(key)),
      set: jest.fn(async (key: string, value: unknown) => {
        cacheStore.set(key, value);
      }),
    };

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

    const productRepository: jest.Mocked<ProductRepository> = {
      createDraft: jest.fn(),
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
      findPublicByShopSlugAndProductSlug: jest.fn(),
      listByShop: jest.fn(),
      listPublic: jest.fn(),
      replaceImages: jest.fn(),
      replaceAttributeValues: jest.fn(),
      replaceVariants: jest.fn(),
      replaceInventory: jest.fn(),
      replaceShipping: jest.fn(),
      updateDetails: jest.fn(),
      publish: jest.fn(),
      findByShopIdAndSlug: jest.fn(),
    };

    return {
      cacheManager,
      shopRepository,
      productRepository,
      storageConfig,
    };
  }

  it('issues a local upload ticket when object storage is disabled', async () => {
    const {
      cacheManager, shopRepository, productRepository, storageConfig, 
    } = buildDeps();
    const useCase = new IssueProductImageUploadUrlUseCase(
      cacheManager as Cache,
      shopRepository,
      productRepository,
      storageConfig
    );

    const issued = await useCase.execute(
      actor,
      'shop-1',
      'product-1',
      'image/webp',
      'original'
    );

    expect(issued.key).toContain('shops/shoppub0001/products/productpub01/images/original/');
    expect(issued.token).toBeDefined();
    expect(cacheManager.set).toHaveBeenCalledTimes(1);
  });

  it('returns a real presigned URL when object storage is enabled', async () => {
    const mockedGetSignedUrl = jest.mocked(getSignedUrl);
    mockedGetSignedUrl.mockResolvedValueOnce('http://localhost:9000/bucket/signed');

    const {
      cacheManager, shopRepository, productRepository, storageConfig, 
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
      productRepository,
      storageConfig
    );

    const issued = await useCase.execute(
      actor,
      'shop-1',
      'product-1',
      'image/webp',
      'original'
    );

    expect(issued.token).toBeUndefined();
    expect(issued.presignedUrl).toBe('http://localhost:9000/bucket/signed');
    expect(mockedGetSignedUrl).toHaveBeenCalledTimes(1);
  });
});
