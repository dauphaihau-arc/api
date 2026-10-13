import { NotFoundException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { err, ok } from '~/platform/application/result';
import { CategoryNotFoundError } from '../../app/errors/category-app.error';
import { CategoryController } from './category.controller';

describe('CategoryController', () => {
  const createCategoryUseCase = { execute: jest.fn() };
  const listCategoriesUseCase = { execute: jest.fn() };
  const resolveCategoryUseCase = { execute: jest.fn() };
  const resolveLegacyPathUseCase = { execute: jest.fn() };
  const createCategoryAttributeUseCase = { execute: jest.fn() };
  const getCategoryAttributesUseCase = { execute: jest.fn() };
  const suggestCategoriesUseCase = { execute: jest.fn() };

  const controller = new CategoryController(
    createCategoryUseCase as never,
    listCategoriesUseCase as never,
    resolveCategoryUseCase as never,
    resolveLegacyPathUseCase as never,
    createCategoryAttributeUseCase as never,
    getCategoryAttributesUseCase as never,
    suggestCategoriesUseCase as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers GET :id/attributes on the controller method', () => {
    const handler = CategoryController.prototype.getCategoryAttributes;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':id/attributes');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });

  it('registers GET suggestions on the controller method', () => {
    const handler = CategoryController.prototype.suggestCategories;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('suggestions');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });

  it('registers GET legacy-path on the controller method', () => {
    const handler = CategoryController.prototype.resolveLegacyPath;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('legacy-path');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });

  it('returns the current canonical resolution for an owned legacy path', async () => {
    resolveLegacyPathUseCase.execute.mockResolvedValue(ok({
      category: { id: '34', slug: 'ceramic-mugs', name: 'Mugs' },
      ancestry: [
        { id: '12', slug: 'home', name: 'Home' },
        { id: '34', slug: 'ceramic-mugs', name: 'Mugs' },
      ],
    }));

    await expect(controller.resolveLegacyPath('/c/home/mugs')).resolves.toEqual({
      category: { id: '34', slug: 'ceramic-mugs', name: 'Mugs' },
      ancestry: [
        { id: '12', slug: 'home', name: 'Home' },
        { id: '34', slug: 'ceramic-mugs', name: 'Mugs' },
      ],
      canonical_path: '/c/ceramic-mugs-c34',
    });
    expect(resolveLegacyPathUseCase.execute).toHaveBeenCalledWith('/c/home/mugs');
  });

  it('throws not found for an unowned legacy path', async () => {
    resolveLegacyPathUseCase.execute.mockResolvedValue(
      err(new CategoryNotFoundError()),
    );

    await expect(controller.resolveLegacyPath('/c/home/unknown'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns listed categories in snake_case for the HTTP boundary', async () => {
    listCategoriesUseCase.execute.mockResolvedValue([
      {
        id: 'internal-category-1',
        publicId: 'category-1',
        slug: 'clothing',
        parentId: undefined,
        name: 'Clothing',
        rank: 1,
        imageStorageKey: 'categories/clothing.jpg',
        imageUrl: 'https://cdn.example.com/categories/clothing.jpg',
        attributes: [
          {
            id: 'attribute-1',
            name: 'Material',
            inputType: 'select',
            isRequired: true,
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
      },
    ]);

    await expect(controller.categories({ parentId: undefined })).resolves.toEqual([
      {
        id: 'category-1',
        parent_id: undefined,
        slug: 'clothing',
        name: 'Clothing',
        rank: 1,
        image_url: 'https://cdn.example.com/categories/clothing.jpg',
        attributes: [
          {
            id: 'attribute-1',
            name: 'Material',
            input_type: 'select',
            is_required: true,
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
      },
    ]);
    expect(listCategoriesUseCase.execute).toHaveBeenCalledWith(undefined);
  });

  it('returns suggested categories in snake_case for the HTTP boundary', async () => {
    suggestCategoriesUseCase.execute.mockResolvedValue([
      {
        id: 'category-1',
        lastNameCategory: 'Mugs',
        categoriesRelated: ['Home', 'Kitchen', 'Mugs'],
      },
    ]);

    await expect(controller.suggestCategories({ name: 'mug', limit: 3 })).resolves.toEqual({
      categories: [
        {
          id: 'category-1',
          last_name_category: 'Mugs',
          categories_related: ['Home', 'Kitchen', 'Mugs'],
        },
      ],
    });
    expect(suggestCategoriesUseCase.execute).toHaveBeenCalledWith('mug', 3);
  });

  it('returns the category attributes for an existing category', async () => {
    getCategoryAttributesUseCase.execute.mockResolvedValue(ok([
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
    ]));

    await expect(controller.getCategoryAttributes('category-1')).resolves.toEqual({
      attributes: [
        {
          id: 'attribute-1',
          key: 'material',
          name: 'Material',
          input_type: 'select',
          is_required: false,
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
    expect(getCategoryAttributesUseCase.execute).toHaveBeenCalledWith('category-1');
  });

  it('throws not found when the category does not exist', async () => {
    getCategoryAttributesUseCase.execute.mockResolvedValue(
      err(new CategoryNotFoundError()),
    );

    await expect(controller.getCategoryAttributes('missing-category'))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
