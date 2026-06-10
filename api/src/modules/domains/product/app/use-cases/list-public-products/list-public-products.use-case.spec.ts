import { ListPublicProductsUseCase } from './list-public-products.use-case';

describe('ListPublicProductsUseCase', () => {
  const productRepository = {
    listPublic: jest.fn(),
  } as never;
  const categoryRepository = {
    findById: jest.fn(),
    findAllByParentId: jest.fn(),
  } as never;

  const useCase = new ListPublicProductsUseCase(
    productRepository,
    categoryRepository
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
