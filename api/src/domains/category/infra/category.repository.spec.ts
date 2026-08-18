import type { OptionalCacheService } from '~/integrations/cache/optional-cache.service';
import type { CategoryCommandRepository } from '../app/ports/category-command.repository';
import type { CategoryQueryRepository } from '../app/ports/category-query.repository';
import { DelegatingCategoryRepository } from './category.repository';

describe('DelegatingCategoryRepository', () => {
  function buildRepository() {
    const commandRepository = {} as CategoryCommandRepository;
    const queryRepository: Pick<jest.Mocked<CategoryQueryRepository>, 'findSelfAndDescendants'> = {
      findSelfAndDescendants: jest.fn().mockResolvedValue([
        {
          id: 'category-1',
          name: 'Category',
          rank: 1,
          attributes: [],
        },
      ]),
    };
    const optionalCacheService: Pick<jest.Mocked<OptionalCacheService>, 'get' | 'set'> = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    };

    return {
      queryRepository,
      optionalCacheService,
      repository: new DelegatingCategoryRepository(
        commandRepository,
        queryRepository as CategoryQueryRepository,
        optionalCacheService as unknown as OptionalCacheService,
      ),
    };
  }

  it('returns cached taxonomy subtree without querying storage', async () => {
    const { queryRepository, optionalCacheService, repository } = buildRepository();
    optionalCacheService.get.mockResolvedValue([
      {
        id: 'cached-category',
        name: 'Cached Category',
        rank: 1,
        attributes: [],
      },
    ]);

    await expect(repository.findSelfAndDescendants('category-1')).resolves.toEqual([
      {
        id: 'cached-category',
        name: 'Cached Category',
        rank: 1,
        attributes: [],
      },
    ]);

    expect(optionalCacheService.get).toHaveBeenCalledWith(
      'category.taxonomy-subtree',
      'category:taxonomy-subtree:v1:category-1',
    );
    expect(queryRepository.findSelfAndDescendants).not.toHaveBeenCalled();
    expect(optionalCacheService.set).not.toHaveBeenCalled();
  });

  it('stores taxonomy subtree after cache miss', async () => {
    const { queryRepository, optionalCacheService, repository } = buildRepository();

    await expect(repository.findSelfAndDescendants('category-1')).resolves.toEqual([
      {
        id: 'category-1',
        name: 'Category',
        rank: 1,
        attributes: [],
      },
    ]);

    expect(queryRepository.findSelfAndDescendants).toHaveBeenCalledWith('category-1');
    expect(optionalCacheService.set).toHaveBeenCalledWith(
      'category.taxonomy-subtree',
      'category:taxonomy-subtree:v1:category-1',
      [
        {
          id: 'category-1',
          name: 'Category',
          rank: 1,
          attributes: [],
        },
      ],
      300_000,
    );
  });
});
