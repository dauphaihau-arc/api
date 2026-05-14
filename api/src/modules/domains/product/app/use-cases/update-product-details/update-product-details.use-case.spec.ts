import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';
import type { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import { ProductVariantType } from '../../../domain/enums/product-variant-type.enum';
import type { ProductRepository } from '../../ports/product.repository';
import type { ProductDraftSummary } from '../../product.types';
import { UpdateProductDetailsUseCase } from './update-product-details.use-case';

describe('UpdateProductDetailsUseCase', () => {
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

  function buildDeps(currentProduct = product) {
    const productRepository: jest.Mocked<ProductRepository> = {
      createDraft: jest.fn(),
      findById: jest.fn().mockResolvedValue(currentProduct),
      findPublicById: jest.fn(),
      listByShop: jest.fn(),
      listPublic: jest.fn(),
      replaceImages: jest.fn(),
      replaceAttributeValues: jest.fn(),
      replaceVariants: jest.fn(),
      replaceInventory: jest.fn(),
      replaceShipping: jest.fn(),
      updateDetails: jest.fn().mockImplementation(async (input) => ({
        ...currentProduct,
        title: input.title,
        slug: input.slug,
        description: input.description,
        whoMade: input.whoMade,
        isDigital: input.isDigital,
        nonTaxable: input.nonTaxable,
        variantGroupName: input.variantGroupName,
        variantSubGroupName: input.variantSubGroupName,
      })),
      publish: jest.fn(),
      findByShopIdAndSlug: jest.fn().mockResolvedValue(null),
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

    return {
      productRepository,
      shopRepository,
    };
  }

  it('updates base fields and regenerates the slug from title', async () => {
    const { productRepository, shopRepository } = buildDeps();
    const useCase = new UpdateProductDetailsUseCase(
      productRepository,
      shopRepository
    );

    const result = await useCase.execute(actor, product.id, {
      title: '  Better Mug  ',
      description: '  Better description  ',
      isDigital: true,
      nonTaxable: true,
      variantGroupName: 'Finish',
    });

    expect(result.isOk).toBe(true);
    expect(productRepository.findByShopIdAndSlug).toHaveBeenCalledWith(
      product.shopId,
      'better-mug'
    );
    expect(productRepository.updateDetails).toHaveBeenCalledWith({
      productId: product.id,
      title: 'Better Mug',
      slug: 'better-mug',
      description: 'Better description',
      whoMade: product.whoMade,
      isDigital: true,
      nonTaxable: true,
      variantGroupName: 'Finish',
      variantSubGroupName: undefined,
    });
  });

  it('rejects variant labels for products without variants', async () => {
    const { productRepository, shopRepository } = buildDeps({
      ...product,
      variantType: ProductVariantType.NONE,
      variantGroupName: undefined,
    });
    const useCase = new UpdateProductDetailsUseCase(
      productRepository,
      shopRepository
    );

    const result = await useCase.execute(actor, product.id, {
      variantGroupName: 'Color',
    });

    expect(result.isOk).toBe(false);
    expect(productRepository.updateDetails).not.toHaveBeenCalled();
  });
});
