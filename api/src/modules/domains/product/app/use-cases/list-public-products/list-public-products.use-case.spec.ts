import type { CategoryRepository } from '~/modules/domains/category/app/ports/category.repository';
import type { StorefrontProductQueryRepository } from '../../ports/storefront-product-query.repository';
import { ListPublicProductsUseCase } from './list-public-products.use-case';

describe('ListPublicProductsUseCase', () => {
  const productRepository: Pick<jest.Mocked<StorefrontProductQueryRepository>, 'listPublic'> = {
    listPublic: jest.fn(),
  };
  const categoryRepository: Pick<jest.Mocked<CategoryRepository>, 'findById' | 'findAllByParentId'> = {
    findById: jest.fn(),
    findAllByParentId: jest.fn(),
  };

  const useCase = new ListPublicProductsUseCase(
    productRepository as never,
    categoryRepository as never
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns an empty result when a requested category does not exist', async () => {
    categoryRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute({
      page: 1,
      limit: 12,
      categoryId: 'missing-category',
    })).resolves.toEqual({
      items: [],
      meta: {
        page: 1,
        limit: 12,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
    expect(productRepository.listPublic).not.toHaveBeenCalled();
  });
});
