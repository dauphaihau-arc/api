import type { CategoryRepository } from '~/domains/category/app/ports/category.repository';
import type { StorefrontProductQueryRepository } from '../../ports/storefront-product-query.repository';
import type { PublicProductDetail } from '../../product.types';
import { GetPublicProductBySlugsUseCase } from './get-public-product-by-slugs.use-case';

describe('GetPublicProductBySlugsUseCase', () => {
  const product: PublicProductDetail = {
    id: 'product-1',
    publicId: 'public-product-1',
    shop: {
      id: 'shop-1',
      publicId: 'public-shop-1',
      shopName: 'owner-shop',
      slug: 'owner-shop',
    },
    categoryId: 'category-1',
    title: 'Handmade Mug',
    slug: 'handmade-mug',
    description: 'Wheel-thrown ceramic mug',
    whoMade: 'i_did' as PublicProductDetail['whoMade'],
    isDigital: false,
    stockNoticeThreshold: 10,
    reviewSummary: {
      average: 0,
      count: 0,
    },
    images: [],
    variants: [],
    inventory: [],
  };

  const categoryNamesByLanguage: Record<string, Record<string, string>> = {
    en: {
      'category-1': 'Mugs & Cups',
      'category-root': 'Home & Living',
    },
    vi: {
      'category-1': 'Cốc sứ',
      'category-root': 'Nhà cửa',
    },
  };

  function buildRepository(): Pick<jest.Mocked<StorefrontProductQueryRepository>, 'findPublicByShopSlugAndProductSlug'> {
    return {
      findPublicByShopSlugAndProductSlug: jest.fn().mockResolvedValue(product),
    };
  }

  function buildCategoryRepository(): Pick<jest.Mocked<CategoryRepository>, 'findById'> {
    return {
      findById: jest.fn(async (categoryId: string, language = 'en') => {
        switch (categoryId) {
          case 'category-1':
            // Name deliberately differs from the persisted slug so the expected
            // ancestry proves the persisted slug is used, not a name-derived one.
            return {
              id: 'category-1',
              publicId: '11',
              slug: 'ceramic-mugs',
              parentId: 'category-root',
              name: categoryNamesByLanguage[language]['category-1'],
              rank: 1,
              attributes: [],
            };
          case 'category-root':
            return {
              id: 'category-root',
              publicId: '10',
              slug: 'home-decor',
              name: categoryNamesByLanguage[language]['category-root'],
              rank: 1,
              attributes: [],
            };
          default:
            return null;
        }
      }),
    };
  }

  function buildLocalizationService(language = 'en') {
    return {
      getStorefrontLanguage: jest.fn().mockReturnValue(language),
    };
  }

  it('returns the public product with an English category path', async () => {
    const repository = buildRepository();
    const categoryRepository = buildCategoryRepository();
    const localizationService = buildLocalizationService('en');
    const useCase = new GetPublicProductBySlugsUseCase(
      repository as never,
      categoryRepository as never,
      localizationService as never,
    );

    const result = await useCase.execute(product.shop.slug, product.slug);

    expect(repository.findPublicByShopSlugAndProductSlug).toHaveBeenCalledWith(
      product.shop.slug,
      product.slug,
    );
    expect(categoryRepository.findById).toHaveBeenNthCalledWith(1, 'category-1', 'en');
    expect(categoryRepository.findById).toHaveBeenNthCalledWith(2, 'category-root', 'en');
    expect(result).toEqual({
      ...product,
      categoryPath: [
        {
          id: '10',
          name: 'Home & Living',
          slug: 'home-decor',
        },
        {
          id: '11',
          name: 'Mugs & Cups',
          slug: 'ceramic-mugs',
        },
      ],
    });
  });

  it('resolves Vietnamese category names without changing identifiers or slugs', async () => {
    const repository = buildRepository();
    const categoryRepository = buildCategoryRepository();
    const localizationService = buildLocalizationService('vi');
    const useCase = new GetPublicProductBySlugsUseCase(
      repository as never,
      categoryRepository as never,
      localizationService as never,
    );

    const result = await useCase.execute(product.shop.slug, product.slug);

    expect(categoryRepository.findById).toHaveBeenNthCalledWith(1, 'category-1', 'vi');
    expect(categoryRepository.findById).toHaveBeenNthCalledWith(2, 'category-root', 'vi');
    expect(result?.categoryPath).toEqual([
      {
        id: '10',
        name: 'Nhà cửa',
        slug: 'home-decor',
      },
      {
        id: '11',
        name: 'Cốc sứ',
        slug: 'ceramic-mugs',
      },
    ]);
  });

  it('returns a product without pulling a category path when it has no category', async () => {
    const repository = buildRepository();
    repository.findPublicByShopSlugAndProductSlug.mockResolvedValue({
      ...product,
      categoryId: undefined,
    });
    const categoryRepository = buildCategoryRepository();
    const localizationService = buildLocalizationService('vi');
    const useCase = new GetPublicProductBySlugsUseCase(
      repository as never,
      categoryRepository as never,
      localizationService as never,
    );

    await expect(useCase.execute(product.shop.slug, product.slug)).resolves.toEqual({
      ...product,
      categoryId: undefined,
    });
    expect(categoryRepository.findById).not.toHaveBeenCalled();
    expect(localizationService.getStorefrontLanguage).not.toHaveBeenCalled();
  });

  it('returns null when the product is not found', async () => {
    const repository = buildRepository();
    repository.findPublicByShopSlugAndProductSlug.mockResolvedValue(null);
    const categoryRepository = buildCategoryRepository();
    const localizationService = buildLocalizationService('vi');
    const useCase = new GetPublicProductBySlugsUseCase(
      repository as never,
      categoryRepository as never,
      localizationService as never,
    );

    await expect(useCase.execute(product.shop.slug, product.slug)).resolves.toBeNull();
  });
});
