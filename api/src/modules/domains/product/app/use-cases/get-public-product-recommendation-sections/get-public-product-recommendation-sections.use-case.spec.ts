import type { ProductRecommendationQueryRepository } from '../../ports/product-recommendation-query.repository';
import type { PublicProductOrderHistoryService } from '../../services/public-product-order-history.service';
import type { PublicProductViewHistoryService } from '../../services/public-product-view-history.service';
import { GetPublicProductRecommendationSectionsUseCase } from './get-public-product-recommendation-sections.use-case';

describe('GetPublicProductRecommendationSectionsUseCase', () => {
  function buildRepository(): Pick<jest.Mocked<ProductRecommendationQueryRepository>, 'recommendSimilarPublic' | 'listPublicByShopSlug'> {
    return {
      recommendSimilarPublic: jest.fn().mockResolvedValue([
        {
          id: 'similar-1',
          shop: {
            id: 'shop-1',
            shopName: 'Arc Store',
            slug: 'arc-store',
          },
          title: 'Similar Product',
          slug: 'similar-product',
          availability: {
            inStock: true,
            lowStock: false,
            stockTotal: 3,
          },
          variantCount: 1,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]),
      listPublicByShopSlug: jest.fn().mockResolvedValue([
        {
          id: 'seller-1',
          shop: {
            id: 'shop-1',
            shopName: 'Arc Store',
            slug: 'arc-store',
          },
          title: 'Seller Product',
          slug: 'seller-product',
          availability: {
            inStock: true,
            lowStock: false,
            stockTotal: 5,
          },
          variantCount: 1,
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      ]),
    };
  }

  function buildViewHistoryService(): Pick<jest.Mocked<PublicProductViewHistoryService>, 'listAlsoViewedProducts'> {
    return {
      listAlsoViewedProducts: jest.fn().mockResolvedValue([
        {
          id: 'viewed-1',
          shop: {
            id: 'shop-1',
            shopName: 'Arc Store',
            slug: 'arc-store',
          },
          title: 'Viewed Together',
          slug: 'viewed-together',
          availability: {
            inStock: true,
            lowStock: false,
            stockTotal: 7,
          },
          variantCount: 1,
          createdAt: new Date('2026-01-03T00:00:00.000Z'),
        },
      ]),
    };
  }

  function buildOrderHistoryService(): Pick<jest.Mocked<PublicProductOrderHistoryService>, 'listFrequentlyBoughtTogether'> {
    return {
      listFrequentlyBoughtTogether: jest.fn().mockResolvedValue([
        {
          id: 'bought-1',
          shop: {
            id: 'shop-1',
            shopName: 'Arc Store',
            slug: 'arc-store',
          },
          title: 'Bought Together',
          slug: 'bought-together',
          availability: {
            inStock: true,
            lowStock: false,
            stockTotal: 2,
          },
          variantCount: 1,
          createdAt: new Date('2026-01-04T00:00:00.000Z'),
        },
      ]),
    };
  }

  it('returns populated PDP recommendation sections', async () => {
    const repository = buildRepository();
    const viewHistoryService = buildViewHistoryService();
    const orderHistoryService = buildOrderHistoryService();
    const useCase = new GetPublicProductRecommendationSectionsUseCase(
      repository as never,
      viewHistoryService as never,
      orderHistoryService as never
    );

    const result = await useCase.execute('arc-store', 'handmade-bag', 6);

    expect(repository.recommendSimilarPublic).toHaveBeenCalledWith({
      shopSlug: 'arc-store',
      productSlug: 'handmade-bag',
      limit: 6,
    });
    expect(repository.listPublicByShopSlug).toHaveBeenCalledWith({
      shopSlug: 'arc-store',
      excludeProductSlug: 'handmade-bag',
      limit: 6,
    });
    expect(viewHistoryService.listAlsoViewedProducts).toHaveBeenCalledWith({
      shopSlug: 'arc-store',
      productSlug: 'handmade-bag',
      limit: 6,
    });
    expect(orderHistoryService.listFrequentlyBoughtTogether).toHaveBeenCalledWith({
      shopSlug: 'arc-store',
      productSlug: 'handmade-bag',
      limit: 6,
    });
    expect(result).toEqual([
      {
        type: 'similar_products',
        title: 'Similar products',
        items: expect.any(Array),
      },
      {
        type: 'from_same_seller',
        title: 'More from this seller',
        items: expect.any(Array),
      },
      {
        type: 'customers_also_viewed',
        title: 'Customers also viewed',
        items: expect.any(Array),
      },
      {
        type: 'frequently_bought_together',
        title: 'Frequently bought together',
        items: expect.any(Array),
      },
    ]);
  });

  it('filters empty sections', async () => {
    const repository = buildRepository();
    const viewHistoryService = buildViewHistoryService();
    const orderHistoryService = buildOrderHistoryService();
    repository.listPublicByShopSlug.mockResolvedValue([]);
    viewHistoryService.listAlsoViewedProducts.mockResolvedValue([]);
    orderHistoryService.listFrequentlyBoughtTogether.mockResolvedValue([]);
    const useCase = new GetPublicProductRecommendationSectionsUseCase(
      repository as never,
      viewHistoryService as never,
      orderHistoryService as never
    );

    const result = await useCase.execute('arc-store', 'handmade-bag', 6);

    expect(result).toEqual([
      {
        type: 'similar_products',
        title: 'Similar products',
        items: expect.any(Array),
      },
    ]);
  });
});
