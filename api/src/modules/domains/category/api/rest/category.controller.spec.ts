import { NotFoundException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { err, ok } from '~/common/application/result';
import { CategoryNotFoundError } from '../../app/errors/category-app.error';
import { CategoryController } from './category.controller';

describe('CategoryController', () => {
  const createCategoryUseCase = { execute: jest.fn() } as never;
  const listCategoriesUseCase = { execute: jest.fn() } as never;
  const createCategoryAttributeUseCase = { execute: jest.fn() } as never;
  const getCategoryAttributesUseCase = { execute: jest.fn() } as never;
  const searchCategoriesUseCase = { execute: jest.fn() } as never;

  const controller = new CategoryController(
    createCategoryUseCase,
    listCategoriesUseCase,
    createCategoryAttributeUseCase,
    getCategoryAttributesUseCase,
    searchCategoriesUseCase
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers GET :id/attributes on the controller method', () => {
    const handler = CategoryController.prototype.getCategoryAttributes;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':id/attributes');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });

  it('returns listed categories in snake_case for the HTTP boundary', async () => {
    listCategoriesUseCase.execute.mockResolvedValue([
      {
        id: 'category-1',
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
        name: 'Clothing',
        rank: 1,
        image_storage_key: 'categories/clothing.jpg',
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

  it('returns the category attributes for an existing category', async () => {
    getCategoryAttributesUseCase.execute.mockResolvedValue(ok([
      {
        id: 'attribute-1',
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
      err(new CategoryNotFoundError())
    );

    await expect(controller.getCategoryAttributes('missing-category'))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
