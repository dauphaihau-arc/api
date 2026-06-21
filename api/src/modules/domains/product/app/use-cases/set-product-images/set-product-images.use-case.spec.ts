import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';
import type { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import { appJobDeduplicationKey, appJobName } from '~/common/jobs/job.types';
import type { JobDispatcher } from '~/modules/shared/queue/app/ports/job-dispatcher';
import type { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import type { ProductCommandRepository } from '../../ports/product-command.repository';
import type { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import type { ProductDraftSummary } from '../../product.types';
import { SetProductImagesUseCase } from './set-product-images.use-case';

describe('SetProductImagesUseCase', () => {
  const actor: AuthenticatedUser = {
    userId: 'shop-owner-1',
    email: 'owner@example.com',
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    roles: [],
    permissions: [],
  };

  const product: ProductDraftSummary = {
    id: 'product-1',
    publicId: 'productpub01',
    shopId: 'shop-owner-1',
    shopPublicId: 'shoppub0001',
    categoryId: 'category-1',
    title: 'Handmade Mug',
    slug: 'handmade-mug',
    description: 'Wheel-thrown ceramic mug',
    state: 'draft' as ProductDraftSummary['state'],
    whoMade: 'i_did' as ProductDraftSummary['whoMade'],
    isDigital: false,
    nonTaxable: false,
    variantType: 'none' as ProductDraftSummary['variantType'],
    images: [],
    attributes: [],
    variants: [],
    inventory: [],
  };

  function buildDeps() {
    const productRepository = {
      findById: jest.fn().mockResolvedValue(product),
      replaceImages: jest.fn().mockResolvedValue({
        product: {
          ...product,
          images: [
            {
              id: 'img-1',
              storageKey: 'products/product-1/images/a.jpg',
              url: 'http://localhost:9000/app-files/products/product-1/images/a.jpg',
              rank: 1,
            },
          ],
        },
        removedStorageKeys: ['products/product-1/images/old.jpg'],
      }),
    } as unknown as jest.Mocked<
      SellerProductQueryRepository & ProductCommandRepository
    >;

    const storageService: jest.Mocked<StorageService> = {
      putObject: jest.fn().mockResolvedValue({
        key: 'dev/public/shops/shoppub0001/products/productpub01/images/image-1/original.jpg',
        size: 12,
        contentType: 'image/jpeg',
      }),
      getObject: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn(),
      getPublicUrl: jest.fn(),
      ping: jest.fn(),
    };

    const shopRepository: jest.Mocked<ShopRepository> = {
      create: jest.fn(),
      findById: jest.fn(),
      findByOwnerUserId: jest.fn(),
      findByShopName: jest.fn(),
      findBySlug: jest.fn(),
      findOwnedById: jest.fn().mockResolvedValue({
        id: 'shop-owner-1',
        publicId: 'shoppub0001',
        ownerUserId: actor.userId,
        shopName: 'owner-shop',
        slug: 'owner-shop',
        status: 'active',
      }),
    };

    const jobDispatcher: jest.Mocked<JobDispatcher> = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    } as jest.Mocked<JobDispatcher>;

    return {
      productRepository,
      shopRepository,
      storageService,
      jobDispatcher,
    };
  }

  it('uploads files, replaces images, and deletes old storage keys', async () => {
    const {
      productRepository, shopRepository, storageService, jobDispatcher, 
    } = buildDeps();
    const useCase = new SetProductImagesUseCase(
      productRepository,
      productRepository,
      shopRepository,
      storageService,
      jobDispatcher,
    );

    const result = await useCase.execute(actor, product.id, {
      files: [
        {
          originalname: 'mug.jpg',
          mimetype: 'image/jpeg',
          buffer: Buffer.from('img'),
        },
      ],
    });

    expect(result.isOk).toBe(true);
    expect(storageService.putObject).toHaveBeenCalledTimes(1);
    expect(storageService.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(
          /shops\/shoppub0001\/products\/productpub01\/images\/[^/]+\/original\.jpg$/,
        ),
      }),
    );
    expect(productRepository.replaceImages).toHaveBeenCalledTimes(1);
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      appJobName.generateProductImageVariants,
      { productId: product.id },
      {
        deduplicationKey: appJobDeduplicationKey.generateProductImageVariants(product.id),
      },
    );
    expect(storageService.deleteObject).toHaveBeenCalledWith(
      'products/product-1/images/old.jpg',
    );
  });
});
