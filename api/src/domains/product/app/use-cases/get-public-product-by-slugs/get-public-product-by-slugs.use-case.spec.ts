import type { CategoryRepository } from '~/domains/category/app/ports/category.repository';
import type { StorefrontProductQueryRepository } from '../../ports/storefront-product-query.repository';
import type { PublicProductDetail } from '../../product.types';
import { GetPublicProductBySlugsUseCase } from './get-public-product-by-slugs.use-case';

describe('GetPublicProductBySlugsUseCase', () => {
  const product: PublicProductDetail = {
    id: 'product-1',
    shop: {
      id: 'shop-1',
      shopName: 'owner-shop',
      slug: 'owner-shop',
    },
    categoryId: 'category-1',
    title: 'Handmade Mug',
    slug: 'handmade-mug',
    description: 'Wheel-thrown ceramic mug',
    whoMade: 'i_did' as PublicProductDetail['whoMade'],
    isDigital: false,
    variantType: 'none' as PublicProductDetail['variantType'],
    stockNoticeThreshold: 10,
    reviewSummary: {
      average: 0,
      count: 0,
    },
    images: [],
    variants: [],
    inventory: [],
  };

  function buildRepository(): Pick<jest.Mocked<StorefrontProductQueryRepository>, 'findPublicByShopSlugAndProductSlug'> {
    return {
      findPublicByShopSlugAndProductSlug: jest.fn().mockResolvedValue(product),
    };
  }

  function buildCategoryRepository(): Pick<jest.Mocked<CategoryRepository>, 'findById'> {
    return {
      findById: jest.fn(async (categoryId: string) => {
        switch (categoryId) {
          case 'category-1':
            return {
              id: 'category-1',
              parentId: 'category-root',
              name: 'Ceramic Mugs',
              rank: 1,
              attributes: [],
            };
          case 'category-root':
            return {
              id: 'category-root',
              name: 'Home Decor',
              rank: 1,
              attributes: [],
            };
          default:
            return null;
        }
      }),
    };
  }

  it('returns the public product when found by slugs', async () => {
    const repository = buildRepository();
    const categoryRepository = buildCategoryRepository();
    const useCase = new GetPublicProductBySlugsUseCase(
      repository as never,
      categoryRepository as never,
    );

    const result = await useCase.execute(product.shop.slug, product.slug);

    expect(repository.findPublicByShopSlugAndProductSlug).toHaveBeenCalledWith(
      product.shop.slug,
      product.slug,
    );
    expect(categoryRepository.findById).toHaveBeenNthCalledWith(1, 'category-1');
    expect(categoryRepository.findById).toHaveBeenNthCalledWith(2, 'category-root');
    expect(result).toEqual({
      ...product,
      categoryPath: [
        {
          id: 'category-root',
          name: 'Home Decor',
          slug: 'home-decor',
        },
        {
          id: 'category-1',
          name: 'Ceramic Mugs',
          slug: 'ceramic-mugs',
        },
      ],
    });
  });
});
