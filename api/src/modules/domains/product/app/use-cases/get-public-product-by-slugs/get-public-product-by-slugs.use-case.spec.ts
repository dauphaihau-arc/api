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

  it('returns the public product when found by slugs', async () => {
    const repository = buildRepository();
    const useCase = new GetPublicProductBySlugsUseCase(repository as never);

    const result = await useCase.execute(product.shop.slug, product.slug);

    expect(repository.findPublicByShopSlugAndProductSlug).toHaveBeenCalledWith(
      product.shop.slug,
      product.slug
    );
    expect(result).toEqual(product);
  });
});
