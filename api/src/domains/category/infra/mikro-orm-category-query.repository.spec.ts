import type { EntityManager } from '@mikro-orm/postgresql';
import type { StorageService } from '~/integrations/storage/app/ports/storage.service';
import type { CategoryEntity } from './persistence/entities/category.entity';
import { MikroOrmCategoryQueryRepository } from './mikro-orm-category-query.repository';

const storageService = {
  getPublicUrl: (key: string) => `https://cdn.example.com/${key}`,
} as unknown as StorageService;

type FakeCategory = Omit<
  Pick<
    CategoryEntity,
    'id' | 'publicId' | 'slug' | 'name' | 'rank' | 'parent'
  >,
  'parent'
> & {
  parent?: FakeCategory;
  attributes: { getItems: () => never[] };
  translations: {
    isInitialized: () => boolean;
    getItems: () => Array<{ language: 'en' | 'vi'; name?: string }>;
  };
};

function buildCategory(options: {
  id: string;
  publicId: string;
  slug: string;
  name: string;
  rank?: number;
  parent?: FakeCategory;
  translations?: Array<{ language: 'en' | 'vi'; name?: string }>;
}): FakeCategory {
  return {
    id: options.id,
    publicId: options.publicId,
    slug: options.slug,
    name: options.name,
    rank: options.rank ?? 1,
    parent: options.parent,
    attributes: { getItems: () => [] },
    translations: {
      isInitialized: () => true,
      getItems: () => options.translations ?? [],
    },
  };
}

function buildRepository(options?: {
  execute?: jest.Mock;
  findOne?: jest.Mock;
  findAll?: jest.Mock;
}) {
  const execute = options?.execute ?? jest.fn();
  const findOne = options?.findOne ?? jest.fn();
  const findAll = options?.findAll ?? jest.fn();
  const entityManager = {
    getConnection: () => ({ execute }),
    fork: () => ({
      getRepository: () => ({ findOne, findAll }),
    }),
  } as unknown as EntityManager;

  return {
    execute,
    findOne,
    findAll,
    repository: new MikroOrmCategoryQueryRepository(entityManager, storageService),
  };
}

describe('MikroOrmCategoryQueryRepository localization', () => {
  it('resolves ancestry names in Vietnamese and keeps slugs unchanged', async () => {
    const { execute, repository } = buildRepository();
    execute.mockResolvedValue([
      {
        public_id: '12',
        name: 'Home',
        translation_name: 'Nhà cửa',
        slug: 'home',
        featured_facet_keys: null,
        depth: 1,
      },
      {
        public_id: '34',
        name: 'Mugs',
        translation_name: 'Cốc gốm',
        slug: 'ceramic-mugs',
        featured_facet_keys: null,
        depth: 0,
      },
    ]);

    const resolution = await repository.resolveByPublicId('34', 'vi');

    expect(resolution).toEqual({
      category: { id: '34', slug: 'ceramic-mugs', name: 'Cốc gốm' },
      ancestry: [
        { id: '12', slug: 'home', name: 'Nhà cửa' },
        { id: '34', slug: 'ceramic-mugs', name: 'Cốc gốm' },
      ],
    });
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('category_translations'),
      ['34', 'vi'],
    );
  });

  it('falls back per ancestor when a Vietnamese translation is missing', async () => {
    const { execute, repository } = buildRepository();
    execute.mockResolvedValue([
      {
        public_id: '12',
        name: 'Home',
        translation_name: null,
        slug: 'home',
        featured_facet_keys: null,
        depth: 1,
      },
      {
        public_id: '34',
        name: 'Mugs',
        translation_name: 'Cốc gốm',
        slug: 'ceramic-mugs',
        featured_facet_keys: null,
        depth: 0,
      },
    ]);

    const resolution = await repository.resolveByPublicId('34', 'vi');

    expect(resolution?.ancestry).toEqual([
      { id: '12', slug: 'home', name: 'Home' },
      { id: '34', slug: 'ceramic-mugs', name: 'Cốc gốm' },
    ]);
  });

  it('ignores Vietnamese translations for English', async () => {
    const { execute, repository } = buildRepository();
    execute.mockResolvedValue([
      {
        public_id: '34',
        name: 'Mugs',
        translation_name: 'Cốc gốm',
        slug: 'ceramic-mugs',
        featured_facet_keys: null,
        depth: 0,
      },
    ]);

    const resolution = await repository.resolveByPublicId('34', 'en');

    expect(resolution?.category.name).toBe('Mugs');
    expect(execute).toHaveBeenCalledWith(expect.any(String), ['34', 'en']);
  });

  it('localizes a category summary without changing its slug', async () => {
    const { findOne, repository } = buildRepository();
    findOne.mockResolvedValue(
      buildCategory({
        id: 'internal-1',
        publicId: '34',
        slug: 'ceramic-mugs',
        name: 'Ceramic mugs',
        translations: [{ language: 'vi', name: 'Cốc gốm' }],
      }),
    );

    const summary = await repository.findByPublicId('34', 'vi');

    expect(summary?.name).toBe('Cốc gốm');
    expect(summary?.slug).toBe('ceramic-mugs');
    expect(findOne).toHaveBeenCalledWith(
      { publicId: '34' },
      expect.objectContaining({
        populate: expect.arrayContaining(['translations']),
      }),
    );
  });

  it('localizes subtree names in Vietnamese', async () => {
    const { execute, repository } = buildRepository();
    execute.mockResolvedValue([
      {
        category_id: 'internal-1',
        category_public_id: '34',
        parent_id: null,
        category_name: 'Ceramic mugs',
        category_translation_name: 'Cốc gốm',
        category_slug: 'ceramic-mugs',
        category_rank: 1,
        depth: 0,
        image_storage_key: null,
        featured_facet_keys: null,
        attribute_id: null,
        attribute_key: null,
        attribute_name: null,
        attribute_input_type: null,
        attribute_is_required: null,
        attribute_rank: null,
        option_id: null,
        option_value: null,
        option_rank: null,
      },
    ]);

    const summaries = await repository.findSelfAndDescendants('internal-1', 'vi');

    expect(summaries).toHaveLength(1);
    expect(summaries?.[0]).toMatchObject({
      name: 'Cốc gốm',
      slug: 'ceramic-mugs',
    });
    expect(execute).toHaveBeenCalledWith(expect.any(String), [
      'internal-1',
      'vi',
    ]);
  });

  it('matches suggestions against Vietnamese names instead of English ones', async () => {
    const home = buildCategory({
      id: 'home-id',
      publicId: '12',
      slug: 'home',
      name: 'Home',
      translations: [{ language: 'vi', name: 'Nhà cửa' }],
    });
    const kitchen = buildCategory({
      id: 'kitchen-id',
      publicId: '20',
      slug: 'kitchen',
      name: 'Kitchen',
      parent: home,
      translations: [{ language: 'vi', name: 'Nhà bếp' }],
    });
    const mugs = buildCategory({
      id: 'mugs-id',
      publicId: '34',
      slug: 'ceramic-mugs',
      name: 'Ceramic mugs',
      parent: kitchen,
      translations: [{ language: 'vi', name: 'Cốc gốm' }],
    });
    const { findAll, repository } = buildRepository();
    findAll.mockResolvedValue([home, kitchen, mugs]);

    const vietnamese = await repository.searchSuggestions('cốc', 6, 'vi');

    expect(vietnamese).toEqual([
      {
        id: '34',
        lastNameCategory: 'Cốc gốm',
        categoriesRelated: ['Nhà cửa', 'Nhà bếp', 'Cốc gốm'],
      },
    ]);
  });

  it('does not match Vietnamese content with an English-only filter', async () => {
    const mugs = buildCategory({
      id: 'mugs-id',
      publicId: '34',
      slug: 'ceramic-mugs',
      name: 'Ceramic mugs',
      translations: [{ language: 'vi', name: 'Cốc gốm' }],
    });
    const { findAll, repository } = buildRepository();
    findAll.mockResolvedValue([mugs]);

    await expect(repository.searchSuggestions('cốc', 6, 'en')).resolves.toEqual([]);
  });

  it('matches untranslated categories by their English fallback', async () => {
    const mugs = buildCategory({
      id: 'mugs-id',
      publicId: '34',
      slug: 'ceramic-mugs',
      name: 'Ceramic mugs',
    });
    const { findAll, repository } = buildRepository();
    findAll.mockResolvedValue([mugs]);

    await expect(
      repository.searchSuggestions('ceramic', 6, 'vi'),
    ).resolves.toEqual([
      {
        id: '34',
        lastNameCategory: 'Ceramic mugs',
        categoriesRelated: ['Ceramic mugs'],
      },
    ]);
  });
});
