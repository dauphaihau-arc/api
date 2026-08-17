import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import type { CategoryRepository } from '~/domains/category/app/ports/category.repository';
import type { ShopRepository } from '~/domains/shop/app/ports/shop.repository';
import { ProductState } from '../../../domain/enums/product-state.enum';
import { ProductWhoMade } from '../../../domain/enums/product-who-made.enum';
import type { ProductCommandRepository } from '../../ports/product-command.repository';
import type { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import type { ProductDraftSummary } from '../../product.types';
import { CreateProductDraftUseCase } from './create-product-draft.use-case';

describe('CreateProductDraftUseCase', () => {
  const actor: AuthenticatedUser = {
    userId: 'shop-owner-1',
    email: 'owner@example.com',
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    roles: [],
    permissions: [],
  };

  function buildProduct(input: {
    title: string;
    slug: string;
    shopId: string;
    description: string;
    whoMade: ProductWhoMade;
    isDigital: boolean;
    nonTaxable: boolean;
  }): ProductDraftSummary {
    return {
      id: 'product-1',
      shopId: input.shopId,
      title: input.title,
      slug: input.slug,
      description: input.description,
      state: ProductState.DRAFT,
      whoMade: input.whoMade,
      isDigital: input.isDigital,
      nonTaxable: input.nonTaxable,
      images: [],
      attributes: [],
      variants: [],
      inventory: [],
    };
  }

  function buildDeps(existingSlugs: string[]) {
    const shopRepository = {
      findOwnedById: jest.fn().mockResolvedValue({
        id: 'shop-1',
        ownerUserId: actor.userId,
        shopName: 'Owner Shop',
        slug: 'owner-shop',
        status: 'active',
        currency: 'USD',
      }),
    } as unknown as jest.Mocked<ShopRepository>;

    const categoryRepository = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<CategoryRepository>;

    const sellerProductQueryRepository = {
      listSlugsByShopIdAndPrefix: jest.fn().mockResolvedValue(existingSlugs),
    } as unknown as jest.Mocked<SellerProductQueryRepository>;

    const productCommandRepository = {
      createDraft: jest.fn().mockImplementation(async (input) => buildProduct(input)),
    } as unknown as jest.Mocked<ProductCommandRepository>;

    return {
      shopRepository,
      categoryRepository,
      sellerProductQueryRepository,
      productCommandRepository,
    };
  }

  it('uses the base slug when no matching product slug exists', async () => {
    const deps = buildDeps([]);
    const useCase = new CreateProductDraftUseCase(
      deps.shopRepository,
      deps.categoryRepository,
      deps.sellerProductQueryRepository,
      deps.productCommandRepository,
    );

    const result = await useCase.execute(actor, {
      shopId: 'shop-1',
      title: 'Hollow Tee',
      description: 'Soft cotton tee',
      whoMade: ProductWhoMade.I_DID,
    });

    expect(result.isOk).toBe(true);
    expect(deps.sellerProductQueryRepository.listSlugsByShopIdAndPrefix)
      .toHaveBeenCalledWith('shop-1', 'hollow-tee');
    expect(deps.productCommandRepository.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'hollow-tee' }),
    );
  });

  it('uses a readable numeric suffix when the base slug already exists', async () => {
    const deps = buildDeps(['hollow-tee']);
    const useCase = new CreateProductDraftUseCase(
      deps.shopRepository,
      deps.categoryRepository,
      deps.sellerProductQueryRepository,
      deps.productCommandRepository,
    );

    const result = await useCase.execute(actor, {
      shopId: 'shop-1',
      title: 'Hollow Tee',
      description: 'Soft cotton tee',
      whoMade: ProductWhoMade.I_DID,
    });

    expect(result.isOk).toBe(true);
    expect(deps.productCommandRepository.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'hollow-tee-2' }),
    );
  });

  it('fills the first available numeric suffix and ignores non-numeric prefix matches', async () => {
    const deps = buildDeps([
      'hollow-tee',
      'hollow-tee-2',
      'hollow-tee-4',
      'hollow-tee-shirt',
      'hollow-tee-copy',
    ]);
    const useCase = new CreateProductDraftUseCase(
      deps.shopRepository,
      deps.categoryRepository,
      deps.sellerProductQueryRepository,
      deps.productCommandRepository,
    );

    const result = await useCase.execute(actor, {
      shopId: 'shop-1',
      title: 'Hollow Tee',
      description: 'Soft cotton tee',
      whoMade: ProductWhoMade.I_DID,
    });

    expect(result.isOk).toBe(true);
    expect(deps.productCommandRepository.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'hollow-tee-3' }),
    );
  });
});
