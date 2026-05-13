import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';
import type { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import { ProductVariantType } from '../../domain/enums/product-variant-type.enum';
import type { ProductRepository } from '../ports/product.repository';
import type { ProductDraftSummary } from '../product.types';
import { SetProductVariantsUseCase } from './set-product-variants.use-case';

describe('SetProductVariantsUseCase', () => {
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
    variants: [],
    inventory: [],
  };

  function buildDeps() {
    const productRepository: jest.Mocked<ProductRepository> = {
      createDraft: jest.fn(),
      findById: jest.fn().mockResolvedValue(product),
      replaceImages: jest.fn(),
      replaceAttributeValues: jest.fn(),
      replaceVariants: jest.fn().mockResolvedValue({
        ...product,
        variants: [
          {
            id: 'variant-1',
            name: 'Red',
            optionValue1: 'Red',
            rank: 1,
          },
        ],
      }),
      replaceInventory: jest.fn(),
      replaceShipping: jest.fn(),
      publish: jest.fn(),
      findByShopIdAndSlug: jest.fn(),
    };

    const shopRepository: jest.Mocked<ShopRepository> = {
      findById: jest.fn(),
      findOwnedById: jest.fn().mockResolvedValue({
        id: 'shop-1',
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

  it('replaces variants for a variant-enabled product', async () => {
    const { productRepository, shopRepository } = buildDeps();
    const useCase = new SetProductVariantsUseCase(
      productRepository,
      shopRepository
    );

    const result = await useCase.execute(actor, product.id, {
      variants: [{ optionValue1: 'Red' }],
    });

    expect(result.isOk).toBe(true);
    expect(productRepository.replaceVariants).toHaveBeenCalledWith({
      productId: product.id,
      variants: [
        {
          name: 'Red',
          optionValue1: 'Red',
          optionValue2: undefined,
          rank: 1,
        },
      ],
    });
  });

  it('rejects duplicate variant names', async () => {
    const { productRepository, shopRepository } = buildDeps();
    const useCase = new SetProductVariantsUseCase(
      productRepository,
      shopRepository
    );

    const result = await useCase.execute(actor, product.id, {
      variants: [{ optionValue1: 'Red' }, { optionValue1: 'Red' }],
    });

    expect(result.isOk).toBe(false);
    if (!result.isOk) {
      expect(result.error.message).toContain('Duplicate variant');
    }
    expect(productRepository.replaceVariants).not.toHaveBeenCalled();
  });
});
