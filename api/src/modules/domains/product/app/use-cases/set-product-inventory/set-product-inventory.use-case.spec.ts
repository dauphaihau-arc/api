import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';
import type { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import { ProductVariantType } from '../../../domain/enums/product-variant-type.enum';
import type { ProductRepository } from '../../ports/product.repository';
import type { ProductDraftSummary } from '../../product.types';
import { SetProductInventoryUseCase } from './set-product-inventory.use-case';

describe('SetProductInventoryUseCase', () => {
  const actor: AuthenticatedUser = {
    userId: 'shop-owner-1',
    email: 'owner@example.com',
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    roles: [],
    permissions: [],
  };

  const variantProduct: ProductDraftSummary = {
    id: 'product-1',
    shopId: 'shop-1',
    categoryId: 'category-1',
    title: 'Handmade Mug',
    slug: 'handmade-mug',
    description: 'Wheel-thrown ceramic mug',
    state: 'draft' as ProductDraftSummary['state'],
    whoMade: 'i_did' as ProductDraftSummary['whoMade'],
    isDigital: false,
    nonTaxable: false,
    variantType: ProductVariantType.SINGLE,
    variantGroupName: 'Color',
    images: [],
    attributes: [],
    variants: [
      {
        id: 'variant-1',
        name: 'Red',
        optionValue1: 'Red',
        rank: 1,
      },
    ],
    inventory: [],
  };

  function buildDeps(product = variantProduct) {
    const productRepository: jest.Mocked<ProductRepository> = {
      createDraft: jest.fn(),
      findById: jest.fn().mockResolvedValue(product),
      findPublicByShopSlugAndProductSlug: jest.fn(),
      listByShop: jest.fn(),
      listPublic: jest.fn(),
      replaceImages: jest.fn(),
      replaceAttributeValues: jest.fn(),
      replaceVariants: jest.fn(),
      replaceInventory: jest.fn().mockResolvedValue({
        ...product,
        inventory: [
          {
            id: 'inventory-1',
            productVariantId: 'variant-1',
            sku: 'SKU-RED',
            stock: 10,
            price: 19.99,
          },
        ],
      }),
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
      findBySlug: jest.fn(),
      findOwnedById: jest.fn().mockResolvedValue({
        id: 'shop-1',
        ownerUserId: actor.userId,
        shopName: 'owner-shop',
        slug: 'owner-shop',
        status: 'active',
      }),
    };

    return {
      productRepository,
      shopRepository,
    };
  }

  it('replaces inventory for a variant-backed product', async () => {
    const { productRepository, shopRepository } = buildDeps();
    const useCase = new SetProductInventoryUseCase(
      productRepository,
      shopRepository
    );

    const result = await useCase.execute(actor, variantProduct.id, {
      inventory: [
        {
          productVariantId: 'variant-1',
          sku: 'SKU-RED',
          stock: 10,
          price: 19.99,
        },
      ],
    });

    expect(result.isOk).toBe(true);
    expect(productRepository.replaceInventory).toHaveBeenCalledWith({
      productId: variantProduct.id,
      shopId: variantProduct.shopId,
      inventory: [
        {
          productVariantId: 'variant-1',
          sku: 'SKU-RED',
          stock: 10,
          price: 19.99,
          salePrice: undefined,
        },
      ],
    });
  });

  it('rejects missing variant references for variant-backed products', async () => {
    const { productRepository, shopRepository } = buildDeps();
    const useCase = new SetProductInventoryUseCase(
      productRepository,
      shopRepository
    );

    const result = await useCase.execute(actor, variantProduct.id, {
      inventory: [
        {
          sku: 'SKU-RED',
          stock: 10,
          price: 19.99,
        },
      ],
    });

    expect(result.isOk).toBe(false);
    expect(productRepository.replaceInventory).not.toHaveBeenCalled();
  });
});
