import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { CategoryController } from './category.controller';
import { ResolveCategoryUseCase } from '../../app/use-cases/resolve-category/resolve-category.use-case';
import { CategoryRepository } from '../../app/ports/category.repository';
import { CreateCategoryUseCase } from '../../app/use-cases/create-category/create-category.use-case';
import { ListCategoriesUseCase } from '../../app/use-cases/list-categories/list-categories.use-case';
import { CreateCategoryAttributeUseCase } from '../../app/use-cases/create-category-attribute/create-category-attribute.use-case';
import { GetCategoryAttributesUseCase } from '../../app/use-cases/get-category-attributes/get-category-attributes.use-case';
import { SuggestCategoriesUseCase } from '../../app/use-cases/suggest-categories/suggest-categories.use-case';

/**
 * Public category resolution HTTP seam: `GET /categories/:id` on the real
 * controller + use case, with only the repository port mocked. Proves routing,
 * public-identity validation, root-to-current ancestry, canonical path, and the
 * 404/500 transport mapping.
 */
describe('Public category resolution HTTP', () => {
  let app: INestApplication<App>;
  const repository = { resolveByPublicId: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CategoryController],
      providers: [
        ResolveCategoryUseCase,
        { provide: CategoryRepository, useValue: repository },
        ...[
          CreateCategoryUseCase,
          ListCategoriesUseCase,
          CreateCategoryAttributeUseCase,
          GetCategoryAttributesUseCase,
          SuggestCategoriesUseCase,
        ].map((useCase) => ({ provide: useCase, useValue: {} })),
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    repository.resolveByPublicId.mockReset();
  });

  it('resolves a decimal identity to its current category and root-to-current ancestry', async () => {
    repository.resolveByPublicId.mockResolvedValue({
      category: {
        id: '9007199254740993',
        slug: 'ceramic-mugs',
        name: 'Mugs',
        featuredFacetKeys: ['material'],
      },
      ancestry: [
        { id: '12', slug: 'home', name: 'Home' },
        { id: '34', slug: 'kitchen', name: 'Kitchen' },
        { id: '9007199254740993', slug: 'ceramic-mugs', name: 'Mugs' },
      ],
    });

    const response = await request(app.getHttpServer())
      .get('/categories/9007199254740993')
      .expect(200);

    expect(response.body).toEqual({
      category: {
        id: '9007199254740993',
        slug: 'ceramic-mugs',
        name: 'Mugs',
        featured_facet_keys: ['material'],
      },
      ancestry: [
        { id: '12', slug: 'home', name: 'Home' },
        { id: '34', slug: 'kitchen', name: 'Kitchen' },
        { id: '9007199254740993', slug: 'ceramic-mugs', name: 'Mugs' },
      ],
      canonical_path: '/c/ceramic-mugs-c9007199254740993',
    });
    expect(repository.resolveByPublicId).toHaveBeenCalledWith('9007199254740993');
  });

  it('omits featured facets for a category without them', async () => {
    repository.resolveByPublicId.mockResolvedValue({
      category: { id: '7', slug: 'books', name: 'Books' },
      ancestry: [{ id: '7', slug: 'books', name: 'Books' }],
    });

    const response = await request(app.getHttpServer())
      .get('/categories/7')
      .expect(200);

    expect(response.body).toEqual({
      category: { id: '7', slug: 'books', name: 'Books' },
      ancestry: [{ id: '7', slug: 'books', name: 'Books' }],
      canonical_path: '/c/books-c7',
    });
    expect(response.body.category.featured_facet_keys).toBeUndefined();
  });

  it.each([
    '0',
    '01',
    '-1',
    '1e2',
    '1.5',
    'internal-uuid',
    '9223372036854775808',
    '999999999999999999999999999',
  ])('returns 404 for non-resolvable identity %s', async (id) => {
    await request(app.getHttpServer()).get(`/categories/${id}`).expect(404);
    expect(repository.resolveByPublicId).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown or unavailable category', async () => {
    repository.resolveByPublicId.mockResolvedValue(null);

    await request(app.getHttpServer()).get('/categories/404').expect(404);
    expect(repository.resolveByPublicId).toHaveBeenCalledWith('404');
  });

  it('keeps backend failures as server errors', async () => {
    repository.resolveByPublicId.mockRejectedValue(new Error('database unavailable'));

    await request(app.getHttpServer()).get('/categories/42').expect(500);
  });
});
