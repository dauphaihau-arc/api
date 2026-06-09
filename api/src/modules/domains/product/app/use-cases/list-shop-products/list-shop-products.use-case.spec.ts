import type { ProductRepository } from '../../ports/product.repository';
import { ProductState } from '../../../domain/enums/product-state.enum';
import type { ProductDraftSummary } from '../../product.types';
import { ListShopProductsUseCase } from './list-shop-products.use-case';

describe('ListShopProductsUseCase', () => {
  const draftProduct: ProductDraftSummary = {
    id: 'product-1',
    shopId: 'shop-1',
    categoryId: 'category-1',
    title: 'Handmade Mug',
    slug: 'handmade-mug',
    description: 'Wheel-thrown ceramic mug',
    state: ProductState.DRAFT,
    whoMade: 'i_did' as ProductDraftSummary['whoMade'],
    isDigital: false,
    nonTaxable: false,
    variantType: 'none' as ProductDraftSummary['variantType'],
    images: [],
    attributes: [],
    variants: [],
    inventory: [],
  };

  function buildRepository(): jest.Mocked<ProductRepository> {
    return {
      createDraft: jest.fn(),
      findById: jest.fn(),
      findPublicByShopSlugAndProductSlug: jest.fn(),
      listByShop: jest.fn().mockImplementation(async (input) => {
        const totals = {
          all: 3,
          [ProductState.ACTIVE]: 1,
          [ProductState.INACTIVE]: 1,
          [ProductState.DRAFT]: 1,
        } as const;
        const total = input.state ? totals[input.state] : totals.all;

        return {
          items: input.page === 2 && input.limit === 1 ? [draftProduct] : [],
          meta: {
            page: input.page,
            limit: input.limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / input.limit),
            hasNextPage: input.page < Math.ceil(total / input.limit),
            hasPreviousPage: input.page > 1,
          },
        };
      }),
      listPublic: jest.fn(),
      replaceImages: jest.fn(),
      replaceAttributeValues: jest.fn(),
      replaceVariants: jest.fn(),
      replaceInventory: jest.fn(),
      replaceShipping: jest.fn(),
      updateDetails: jest.fn(),
      updateState: jest.fn(),
      publish: jest.fn(),
      findByShopIdAndSlug: jest.fn(),
    };
  }

  it('returns paginated seller products with trimmed filters', async () => {
    const repository = buildRepository();
    const useCase = new ListShopProductsUseCase(repository);

    const result = await useCase.execute({
      shopId: 'shop-1',
      page: 2,
      limit: 1,
      state: ProductState.DRAFT,
      categoryId: 'category-1',
      search: ' mug ',
    });

    expect(repository.listByShop).toHaveBeenCalledWith({
      shopId: 'shop-1',
      page: 2,
      limit: 1,
      state: ProductState.DRAFT,
      categoryId: 'category-1',
      search: 'mug',
    });
    expect(result.items).toEqual([draftProduct]);
    expect(result.meta).toEqual({
      page: 2,
      limit: 1,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: true,
    });
    expect(result.stateCounts).toEqual({
      all: 3,
      active: 1,
      inactive: 1,
      draft: 1,
    });
  });
});
