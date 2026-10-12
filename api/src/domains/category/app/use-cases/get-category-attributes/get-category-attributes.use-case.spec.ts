import { CategoryNotFoundError } from '../../errors/category-app.error';
import type { CategoryRepository } from '../../ports/category.repository';
import { GetCategoryAttributesUseCase } from './get-category-attributes.use-case';

describe('GetCategoryAttributesUseCase', () => {
  function buildRepository(): jest.Mocked<CategoryRepository> {
    return {
      create: jest.fn(),
      createAttribute: jest.fn(),
      findAllByParentId: jest.fn(),
      findById: jest.fn(),
      findByPublicId: jest.fn(),
      resolveByPublicId: jest.fn(),
      searchSuggestions: jest.fn(),
    };
  }

  it('returns the category attributes when the category exists', async () => {
    const repository = buildRepository();
    repository.findByPublicId.mockResolvedValue({
      id: 'internal-category-1',
      publicId: '1',
      slug: 'hoodies',
      name: 'Hoodies',
      rank: 3,
      attributes: [
        {
          id: 'attribute-1',
          key: 'material',
          name: 'Material',
          inputType: 'select',
          isRequired: false,
          rank: 1,
          options: [
            {
              id: 'option-1',
              value: 'Cotton',
              rank: 1,
            },
          ],
        },
      ],
    });
    const useCase = new GetCategoryAttributesUseCase(repository);

    const result = await useCase.execute('category-1');

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toEqual([
        {
          id: 'attribute-1',
          key: 'material',
          name: 'Material',
          inputType: 'select',
          isRequired: false,
          rank: 1,
          options: [
            {
              id: 'option-1',
              value: 'Cotton',
              rank: 1,
            },
          ],
        },
      ]);
    }
    expect(repository.findByPublicId).toHaveBeenCalledWith('category-1');
  });

  it('returns a not-found error when the category does not exist', async () => {
    const repository = buildRepository();
    repository.findByPublicId.mockResolvedValue(null);
    const useCase = new GetCategoryAttributesUseCase(repository);

    const result = await useCase.execute('missing-category');

    expect(result.isOk).toBe(false);
    if (!result.isOk) {
      expect(result.error).toBeInstanceOf(CategoryNotFoundError);
    }
  });
});
