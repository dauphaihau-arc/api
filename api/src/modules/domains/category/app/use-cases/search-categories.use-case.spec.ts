import type { CategoryRepository } from '../ports/category.repository';
import { SearchCategoriesUseCase } from './search-categories.use-case';

describe('SearchCategoriesUseCase', () => {
  function buildRepository(): jest.Mocked<CategoryRepository> {
    return {
      create: jest.fn(),
      createAttribute: jest.fn(),
      findAllByParentId: jest.fn(),
      findById: jest.fn(),
      searchSuggestions: jest.fn().mockResolvedValue([
        {
          id: 'category-1',
          lastNameCategory: 'Mugs',
          categoriesRelated: ['Home', 'Kitchen', 'Mugs'],
        },
      ]),
    };
  }

  it('trims the query before delegating to the repository', async () => {
    const repository = buildRepository();
    const useCase = new SearchCategoriesUseCase(repository);

    const result = await useCase.execute('  mug  ', 3);

    expect(result).toEqual([
      {
        id: 'category-1',
        lastNameCategory: 'Mugs',
        categoriesRelated: ['Home', 'Kitchen', 'Mugs'],
      },
    ]);
    expect(repository.searchSuggestions).toHaveBeenCalledWith('mug', 3);
  });

  it('returns an empty list for blank queries', async () => {
    const repository = buildRepository();
    const useCase = new SearchCategoriesUseCase(repository);

    await expect(useCase.execute('   ')).resolves.toEqual([]);
    expect(repository.searchSuggestions).not.toHaveBeenCalled();
  });
});
