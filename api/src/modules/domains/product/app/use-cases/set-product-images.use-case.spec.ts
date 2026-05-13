import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';
import type { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import type { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import type { ProductRepository } from '../ports/product.repository';
import type { ProductDraftSummary } from '../product.types';
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
    shopId: 'shop-owner-1',
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
    const productRepository: jest.Mocked<ProductRepository> = {
      createDraft: jest.fn(),
      findById: jest.fn().mockResolvedValue(product),
      findPublicById: jest.fn(),
      listByShop: jest.fn(),
      listPublic: jest.fn(),
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
      replaceAttributeValues: jest.fn(),
      replaceVariants: jest.fn(),
      replaceInventory: jest.fn(),
      replaceShipping: jest.fn(),
      updateDetails: jest.fn(),
      publish: jest.fn(),
      findByShopIdAndSlug: jest.fn(),
    };

    const storageService: jest.Mocked<StorageService> = {
      putObject: jest.fn().mockResolvedValue({
        key: 'products/product-1/images/a.jpg',
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
      findOwnedById: jest.fn().mockResolvedValue({
        id: 'shop-owner-1',
        ownerUserId: actor.userId,
        shopName: 'owner-shop',
        status: 'active',
      }),
    };

    return {
      productRepository,
      shopRepository,
      storageService,
    };
  }

  it('uploads files, replaces images, and deletes old storage keys', async () => {
    const { productRepository, shopRepository, storageService } = buildDeps();
    const useCase = new SetProductImagesUseCase(
      productRepository,
      shopRepository,
      storageService
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
    expect(productRepository.replaceImages).toHaveBeenCalledTimes(1);
    expect(storageService.deleteObject).toHaveBeenCalledWith(
      'products/product-1/images/old.jpg'
    );
  });
});
