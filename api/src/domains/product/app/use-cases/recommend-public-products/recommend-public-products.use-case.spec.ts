import type { ProductRecommendationQueryRepository } from '../../ports/product-recommendation-query.repository';
import type { PublicProductListItem } from '../../product.types';
import { RecommendPublicProductsUseCase } from './recommend-public-products.use-case';

describe('RecommendPublicProductsUseCase', () => {
  const items: PublicProductListItem[] = [{
    id: 'product-2',
    shop: {
      id: 'shop-1',
      shopName: 'owner-shop',
      slug: 'owner-shop',
    },
    categoryId: 'category-1',
    title: 'Handmade Mug 2',
    slug: 'handmade-mug-2',
    availability: {
      inStock: true,
      lowStock: false,
      stockTotal: 9,
    },
    variantCount: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  }];

  function buildRepository(): Pick<jest.Mocked<ProductRecommendationQueryRepository>, 'recommendSimilarPublic'> {
    return {
      recommendSimilarPublic: jest.fn().mockResolvedValue(items),
    };
  }

  it('delegates similar product recommendations to the repository', async () => {
    const repository = buildRepository();
    const useCase = new RecommendPublicProductsUseCase(repository as never);

    const result = await useCase.execute('owner-shop', 'handmade-mug', 6);

    expect(repository.recommendSimilarPublic).toHaveBeenCalledWith({
      shopSlug: 'owner-shop',
      productSlug: 'handmade-mug',
      limit: 6,
    });
    expect(result).toEqual(items);
  });
});
