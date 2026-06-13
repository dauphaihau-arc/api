import type { CategoryRepository } from '~/modules/domains/category/app/ports/category.repository';
import type { StorefrontProductQueryRepository } from '../../ports/storefront-product-query.repository';
import { ListPublicProductsUseCase } from './list-public-products.use-case';

describe('ListPublicProductsUseCase', () => {
  const productRepository: Pick<jest.Mocked<StorefrontProductQueryRepository>, 'listPublic' | 'listPublicFacets'> = {
    listPublic: jest.fn(),
    listPublicFacets: jest.fn(),
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

  it('normalizes id-based attribute filters for facet queries', async () => {
    categoryRepository.findById.mockResolvedValue({
      id: 'category-1',
      attributes: [],
    } as never);
    categoryRepository.findAllByParentId.mockResolvedValue([]);
    productRepository.listPublicFacets.mockResolvedValue([]);

    await useCase.executeFacets({
      page: 1,
      limit: 12,
      categoryId: 'category-1',
      attributeFilters: [{
        attribute_id: 'attribute-1',
        selected_option_ids: ['option-1', 'option-2'],
        selected_option_keys: ['option_1', 'option_2'],
        attribute_name: '',
        selected_option_values: [],
      }],
    });

    expect(productRepository.listPublicFacets).toHaveBeenCalledWith({
      page: 1,
      limit: 12,
      categoryIds: ['category-1'],
      search: undefined,
      title: undefined,
      isDigital: undefined,
      whoMade: undefined,
      attributeFilters: [{
        attributeId: 'attribute-1',
        selectedOptionIds: ['option-1', 'option-2'],
        selectedOptionKeys: ['option_1', 'option_2'],
        attributeName: '',
        selectedOptionValues: [],
      }],
      order: undefined,
    });
  });

  it('expands canonical shoe-size filter aliases for facet queries', async () => {
    categoryRepository.findById.mockResolvedValue({
      id: 'category-1',
      attributes: [],
    } as never);
    categoryRepository.findAllByParentId.mockResolvedValue([]);
    productRepository.listPublicFacets.mockResolvedValue([]);

    await useCase.executeFacets({
      page: 1,
      limit: 12,
      categoryId: 'category-1',
      attributeFilters: [{
        attribute_id: 'shoe_size',
        selected_option_keys: ['eu_39'],
        attribute_name: 'shoe_size',
        selected_option_values: ['EU 39'],
      }],
    });

    expect(productRepository.listPublicFacets).toHaveBeenCalledWith({
      page: 1,
      limit: 12,
      categoryIds: ['category-1'],
      search: undefined,
      title: undefined,
      isDigital: undefined,
      whoMade: undefined,
      attributeFilters: [{
        attributeId: 'shoe_size',
        selectedOptionKeys: ['us_6_5', 'eu_39', 'us_6_5_eu_39'],
        attributeName: 'shoe_size',
        selectedOptionValues: ['US 6.5 / EU 39', 'US 6.5', 'EU 39'],
      }],
      order: undefined,
    });
  });

  it('includes featured facets even when matching products have no options for them', async () => {
    categoryRepository.findById.mockResolvedValue({
      id: 'category-1',
      featuredFacetKeys: ['color', 'material', 'gender'],
      attributes: [
        {
          id: 'attribute-color', key: 'color', name: 'Color', options: [{ value: 'Black' }], 
        },
        {
          id: 'attribute-material', key: 'material', name: 'Material', options: [{ value: 'Cotton' }], 
        },
        {
          id: 'attribute-gender', key: 'gender', name: 'Gender', options: [{ value: 'Unisex' }], 
        },
      ],
    } as never);
    categoryRepository.findAllByParentId.mockResolvedValue([]);
    productRepository.listPublicFacets.mockResolvedValue([
      {
        facetKey: 'color',
        attributeName: 'Color',
        options: [{ optionKey: 'black', value: 'Black' }],
      },
    ]);

    await expect(useCase.executeFacets({
      page: 1,
      limit: 12,
      categoryId: 'category-1',
    })).resolves.toEqual([
      {
        facetKey: 'color',
        attributeName: 'Color',
        options: [{ optionKey: 'black', value: 'Black' }],
      },
      {
        facetKey: 'gender',
        attributeName: 'Gender',
        options: [{ optionKey: 'unisex', value: 'Unisex' }],
      },
      {
        facetKey: 'material',
        attributeName: 'Material',
        options: [{ optionKey: 'cotton', value: 'Cotton' }],
      },
    ]);
  });

  it('inherits featured facets from the nearest ancestor for leaf categories', async () => {
    categoryRepository.findById.mockImplementation(async (categoryId: string) => {
      if (categoryId === 'leaf-category') {
        return {
          id: 'leaf-category',
          parentId: 'fashion-category',
          featuredFacetKeys: [],
          attributes: [
            {
              id: 'attribute-size', key: 'size', name: 'Size', options: [], 
            },
            {
              id: 'attribute-color-leaf', key: 'color', name: 'Color', options: [], 
            },
          ],
        } as never;
      }

      if (categoryId === 'fashion-category') {
        return {
          id: 'fashion-category',
          featuredFacetKeys: ['color', 'material', 'gender'],
          attributes: [
            {
              id: 'attribute-color', key: 'color', name: 'Color', options: [{ value: 'Blue' }], 
            },
            {
              id: 'attribute-material', key: 'material', name: 'Material', options: [{ value: 'Cotton' }], 
            },
            {
              id: 'attribute-gender', key: 'gender', name: 'Gender', options: [{ value: 'Male' }], 
            },
          ],
        } as never;
      }

      return null;
    });
    categoryRepository.findAllByParentId.mockResolvedValue([]);
    productRepository.listPublicFacets.mockResolvedValue([
      {
        facetKey: 'size',
        attributeName: 'Size',
        options: [{ optionKey: 'l', value: 'L' }],
      },
    ]);

    await expect(useCase.executeFacets({
      page: 1,
      limit: 12,
      categoryId: 'leaf-category',
    })).resolves.toEqual([
      {
        facetKey: 'color',
        attributeName: 'Color',
        options: [{ optionKey: 'blue', value: 'Blue' }],
      },
      {
        facetKey: 'gender',
        attributeName: 'Gender',
        options: [{ optionKey: 'male', value: 'Male' }],
      },
      {
        facetKey: 'material',
        attributeName: 'Material',
        options: [{ optionKey: 'cotton', value: 'Cotton' }],
      },
      {
        facetKey: 'size',
        attributeName: 'Size',
        options: [{ optionKey: 'l', value: 'L' }],
      },
    ]);
  });

  it('resolves inherited featured facet labels from descendant category attributes', async () => {
    categoryRepository.findById.mockImplementation(async (categoryId: string) => {
      if (categoryId === 'shoes-category') {
        return {
          id: 'shoes-category',
          parentId: 'fashion-category',
          attributes: [],
        } as never;
      }

      if (categoryId === 'fashion-category') {
        return {
          id: 'fashion-category',
          featuredFacetKeys: ['color', 'material', 'gender'],
          attributes: [],
        } as never;
      }

      return null;
    });
    categoryRepository.findAllByParentId.mockImplementation(async (parentId: string) => {
      if (parentId === 'shoes-category') {
        return [
          {
            id: 'sneakers-category',
            parentId: 'shoes-category',
            attributes: [
              {
                id: 'attribute-color', key: 'color', name: 'Color', options: [{ value: 'White' }], 
              },
              {
                id: 'attribute-material', key: 'material', name: 'Material', options: [{ value: 'Canvas' }], 
              },
              {
                id: 'attribute-gender', key: 'gender', name: 'Gender', options: [{ value: 'Unisex' }], 
              },
            ],
          },
        ] as never;
      }

      return [];
    });
    productRepository.listPublicFacets.mockResolvedValue([
      {
        facetKey: 'color',
        attributeName: 'Color',
        options: [{ optionKey: 'black', value: 'Black' }],
      },
    ]);

    await expect(useCase.executeFacets({
      page: 1,
      limit: 12,
      categoryId: 'shoes-category',
    })).resolves.toEqual([
      {
        facetKey: 'color',
        attributeName: 'Color',
        options: [
          { optionKey: 'black', value: 'Black' },
          { optionKey: 'white', value: 'White' },
        ],
      },
      {
        facetKey: 'gender',
        attributeName: 'Gender',
        options: [{ optionKey: 'unisex', value: 'Unisex' }],
      },
      {
        facetKey: 'material',
        attributeName: 'Material',
        options: [{ optionKey: 'canvas', value: 'Canvas' }],
      },
    ]);
  });

  it('includes subtree-common leaf facets for narrow branch categories', async () => {
    categoryRepository.findById.mockImplementation(async (categoryId: string) => {
      if (categoryId === 'shoes-category') {
        return {
          id: 'shoes-category',
          parentId: 'fashion-category',
          attributes: [],
        } as never;
      }

      if (categoryId === 'fashion-category') {
        return {
          id: 'fashion-category',
          featuredFacetKeys: ['color', 'material', 'gender'],
          attributes: [],
        } as never;
      }

      return null;
    });
    categoryRepository.findAllByParentId.mockImplementation(async (parentId: string) => {
      if (parentId === 'shoes-category') {
        return [
          {
            id: 'sneakers-category',
            parentId: 'shoes-category',
            attributes: [
              {
                id: 'attribute-color', key: 'color', name: 'Color', options: [{ value: 'White' }], 
              },
              {
                id: 'attribute-material', key: 'material', name: 'Material', options: [{ value: 'Canvas' }], 
              },
              {
                id: 'attribute-gender', key: 'gender', name: 'Gender', options: [{ value: 'Unisex' }], 
              },
              {
                id: 'attribute-shoe-size', key: 'shoe_size', name: 'Size', options: [{ value: 'US 8' }], 
              },
              {
                id: 'attribute-style', key: 'style', name: 'Style', options: [{ value: 'Minimal' }], 
              },
            ],
          },
          {
            id: 'boots-category',
            parentId: 'shoes-category',
            attributes: [
              {
                id: 'attribute-color-2', key: 'color', name: 'Color', options: [{ value: 'Black' }], 
              },
              {
                id: 'attribute-material-2', key: 'material', name: 'Material', options: [{ value: 'Leather' }], 
              },
              {
                id: 'attribute-gender-2', key: 'gender', name: 'Gender', options: [{ value: 'Unisex' }], 
              },
              {
                id: 'attribute-shoe-size-2', key: 'shoe_size', name: 'Size', options: [{ value: 'US 9' }], 
              },
              {
                id: 'attribute-style-2', key: 'style', name: 'Style', options: [{ value: 'Classic' }], 
              },
            ],
          },
        ] as never;
      }

      if (parentId === 'sneakers-category' || parentId === 'boots-category') {
        return [];
      }

      return [];
    });
    productRepository.listPublicFacets.mockResolvedValue([
      {
        facetKey: 'color',
        attributeName: 'Color',
        options: [{ optionKey: 'black', value: 'Black' }],
      },
    ]);

    await expect(useCase.executeFacets({
      page: 1,
      limit: 12,
      categoryId: 'shoes-category',
    })).resolves.toEqual([
      {
        facetKey: 'color',
        attributeName: 'Color',
        options: [
          { optionKey: 'black', value: 'Black' },
          { optionKey: 'white', value: 'White' },
        ],
      },
      {
        facetKey: 'gender',
        attributeName: 'Gender',
        options: [{ optionKey: 'unisex', value: 'Unisex' }],
      },
      {
        facetKey: 'material',
        attributeName: 'Material',
        options: [
          { optionKey: 'canvas', value: 'Canvas' },
          { optionKey: 'leather', value: 'Leather' },
        ],
      },
      {
        facetKey: 'shoe_size',
        attributeName: 'Size',
        options: [
          { optionKey: 'us_8_eu_41', value: 'US 8 / EU 41' },
          { optionKey: 'us_9_eu_42', value: 'US 9 / EU 42' },
        ],
      },
      {
        facetKey: 'style',
        attributeName: 'Style',
        options: [
          { optionKey: 'classic', value: 'Classic' },
          { optionKey: 'minimal', value: 'Minimal' },
        ],
      },
    ]);
  });

  it('removes non-featured facets with no options', async () => {
    categoryRepository.findById.mockResolvedValue({
      id: 'category-1',
      featuredFacetKeys: ['color'],
      attributes: [
        {
          id: 'attribute-color', key: 'color', name: 'Color', options: [{ value: 'Black' }], 
        },
      ],
    } as never);
    categoryRepository.findAllByParentId.mockResolvedValue([]);
    productRepository.listPublicFacets.mockResolvedValue([
      {
        facetKey: 'size',
        attributeName: 'Size',
        options: [],
      },
    ]);

    await expect(useCase.executeFacets({
      page: 1,
      limit: 12,
      categoryId: 'category-1',
    })).resolves.toEqual([
      {
        facetKey: 'color',
        attributeName: 'Color',
        options: [{ optionKey: 'black', value: 'Black' }],
      },
    ]);
  });
});
