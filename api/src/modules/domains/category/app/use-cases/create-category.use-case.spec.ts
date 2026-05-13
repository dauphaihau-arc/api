import type { CategoryRepository } from '../ports/category.repository';
import { CreateCategoryUseCase } from './create-category.use-case';

describe('CreateCategoryUseCase', () => {
  function buildRepository(): jest.Mocked<CategoryRepository> {
    return {
      create: jest.fn().mockResolvedValue({
        id: 'category-1',
        name: 'Mugs',
        rank: 1,
        attributes: [],
      }),
      createAttribute: jest.fn(),
      findAllByParentId: jest.fn(),
      findById: jest.fn().mockResolvedValue(null),
    };
  }

  it('creates a root category', async () => {
    const repository = buildRepository();
    const useCase = new CreateCategoryUseCase(repository);

    const result = await useCase.execute({ name: 'Mugs', rank: 1 });

    expect(result.isOk).toBe(true);
    expect(repository.create).toHaveBeenCalledWith({
      parentId: undefined,
      name: 'Mugs',
      rank: 1,
      imageStorageKey: undefined,
    });
  });
});
