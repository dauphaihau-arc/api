import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';
import type { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import type { ProductRepository } from '../../ports/product.repository';
import type { ProductDraftSummary } from '../../product.types';
import { SetProductImagesByKeysUseCase } from './set-product-images-by-keys.use-case';

describe('SetProductImagesByKeysUseCase', () => {
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
              storageKey: 'products/tmp/mug.jpg',
              url: 'http://localhost:9000/app-files/products/tmp/mug.jpg',
              rank: 1,
            },
          ],
        },
        removedStorageKeys: [],
      }),
      replaceAttributeValues: jest.fn(),
      replaceVariants: jest.fn(),
      replaceInventory: jest.fn(),
      replaceShipping: jest.fn(),
      updateDetails: jest.fn(),
      publish: jest.fn(),
      findByShopIdAndSlug: jest.fn(),
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
    };
  }

  it('replaces product images using existing storage keys', async () => {
    const { productRepository, shopRepository } = buildDeps();
    const useCase = new SetProductImagesByKeysUseCase(
      productRepository,
      shopRepository
    );

    const result = await useCase.execute(actor, product.id, {
      images: [
        {
          storageKey: ' products/tmp/mug.jpg ',
          rank: 1,
        },
      ],
    });

    expect(result.isOk).toBe(true);
    expect(productRepository.replaceImages).toHaveBeenCalledWith({
      productId: product.id,
      images: [
        {
          storageKey: 'products/tmp/mug.jpg',
          rank: 1,
        },
      ],
    });
  });
});
