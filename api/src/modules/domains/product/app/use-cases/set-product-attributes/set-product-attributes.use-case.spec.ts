import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';
import type { CategoryRepository } from '~/modules/domains/category/app/ports/category.repository';
import type { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import type { ProductRepository } from '../../ports/product.repository';
import type { ProductDraftSummary } from '../../product.types';
import { SetProductAttributesUseCase } from './set-product-attributes.use-case';

describe('SetProductAttributesUseCase', () => {
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
      replaceImages: jest.fn(),
      replaceAttributeValues: jest.fn().mockResolvedValue({
        ...product,
        attributes: [
          {
            id: 'attribute-value-1',
            categoryAttributeId: 'attribute-1',
            categoryAttributeName: 'Material',
            inputType: 'select',
            selectedOptionId: 'option-1',
            selectedOptionValue: 'Ceramic',
          },
        ],
      }),
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
        id: 'shop-1',
        ownerUserId: actor.userId,
        shopName: 'owner-shop',
        status: 'active',
      }),
    };

    const categoryRepository: jest.Mocked<CategoryRepository> = {
      create: jest.fn(),
      createAttribute: jest.fn(),
      findAllByParentId: jest.fn(),
      findById: jest.fn().mockResolvedValue({
        id: 'category-1',
        name: 'Mugs',
        rank: 1,
        attributes: [
          {
            id: 'attribute-1',
            name: 'Material',
            inputType: 'select',
            isRequired: true,
            rank: 1,
            options: [
              {
                id: 'option-1',
                value: 'Ceramic',
                rank: 1,
              },
            ],
          },
        ],
      }),
      searchSuggestions: jest.fn(),
    };

    return {
      productRepository,
      shopRepository,
      categoryRepository,
    };
  }

  it('replaces attribute selections for a categorized product', async () => {
    const { productRepository, shopRepository, categoryRepository } = buildDeps();
    const useCase = new SetProductAttributesUseCase(
      productRepository,
      shopRepository,
      categoryRepository
    );

    const result = await useCase.execute(actor, product.id, {
      attributes: [
        {
          categoryAttributeId: 'attribute-1',
          selectedOptionId: 'option-1',
        },
      ],
    });

    expect(result.isOk).toBe(true);
    expect(productRepository.replaceAttributeValues).toHaveBeenCalledWith({
      productId: product.id,
      attributes: [
        {
          categoryAttributeId: 'attribute-1',
          selectedOptionId: 'option-1',
          selectedText: undefined,
        },
      ],
    });
  });

  it('rejects missing required attributes', async () => {
    const { productRepository, shopRepository, categoryRepository } = buildDeps();
    const useCase = new SetProductAttributesUseCase(
      productRepository,
      shopRepository,
      categoryRepository
    );

    const result = await useCase.execute(actor, product.id, {
      attributes: [],
    });

    expect(result.isOk).toBe(false);
    expect(productRepository.replaceAttributeValues).not.toHaveBeenCalled();
  });
});
