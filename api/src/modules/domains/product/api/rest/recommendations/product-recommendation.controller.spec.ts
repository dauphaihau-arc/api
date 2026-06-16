import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OptionalJwtAuthGuard } from '~/modules/domains/auth/api/guard/optional-jwt-auth.guard';
import type { PublicProductOrderHistoryService } from '../../../app/services/public-product-order-history.service';
import type { PublicProductViewHistoryService } from '../../../app/services/public-product-view-history.service';
import type { GetPublicProductRecommendationSectionsUseCase } from '../../../app/use-cases/get-public-product-recommendation-sections/get-public-product-recommendation-sections.use-case';
import type { RecommendPublicProductsUseCase } from '../../../app/use-cases/recommend-public-products/recommend-public-products.use-case';
import type { ProductActivitySessionService } from '../activity/product-activity-session.service';
import { ProductRecommendationController } from './product-recommendation.controller';

describe('ProductRecommendationController', () => {
  const recommendPublicProductsUseCase: Pick<jest.Mocked<RecommendPublicProductsUseCase>, 'execute'> = {
    execute: jest.fn(),
  };
  const getPublicProductRecommendationSectionsUseCase: Pick<jest.Mocked<GetPublicProductRecommendationSectionsUseCase>, 'execute'> = {
    execute: jest.fn(),
  };
  const publicProductOrderHistoryService: Pick<jest.Mocked<PublicProductOrderHistoryService>, 'listBestSellingProducts'> = {
    listBestSellingProducts: jest.fn(),
  };
  const publicProductViewHistoryService: Pick<jest.Mocked<PublicProductViewHistoryService>, 'listRecentViews' | 'listTrendingProducts'> = {
    listRecentViews: jest.fn(),
    listTrendingProducts: jest.fn(),
  };
  const productActivitySessionService: Pick<jest.Mocked<ProductActivitySessionService>, 'extractSessionId'> = {
    extractSessionId: jest.fn(),
  };

  const controller = new ProductRecommendationController(
    recommendPublicProductsUseCase as never,
    getPublicProductRecommendationSectionsUseCase as never,
    publicProductOrderHistoryService as never,
    publicProductViewHistoryService as never,
    productActivitySessionService as never
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers GET by-slug/:shop_slug/:product_slug/recommendations on the controller method', () => {
    const handler = ProductRecommendationController.prototype.recommendProducts;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('by-slug/:shop_slug/:product_slug/recommendations');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });

  it('registers GET by-slug/:shop_slug/:product_slug/recommendation-sections on the controller method', () => {
    const handler = ProductRecommendationController.prototype.getRecommendationSections;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('by-slug/:shop_slug/:product_slug/recommendation-sections');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });

  it('registers GET recently-viewed on the controller method', () => {
    const handler = ProductRecommendationController.prototype.listRecentlyViewedProducts;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('recently-viewed');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });

  it('registers GET trending on the controller method', () => {
    const handler = ProductRecommendationController.prototype.listTrendingProducts;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('trending');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });

  it('registers GET best-sellers on the controller method', () => {
    const handler = ProductRecommendationController.prototype.listBestSellingProducts;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('best-sellers');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });

  it('applies optional auth to recommendation routes', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ProductRecommendationController)).toEqual([OptionalJwtAuthGuard]);
  });

  it('returns recommended products for a PDP', async () => {
    recommendPublicProductsUseCase.execute.mockResolvedValue([
      {
        id: 'product-2',
        shop: {
          id: 'shop-1',
          publicId: 'public-shop-1',
          shopName: 'Arc Store',
          slug: 'arc-store',
        },
        categoryId: 'category-1',
        title: 'Handmade Bag 2',
        slug: 'handmade-bag-2',
        availability: {
          inStock: true,
          lowStock: false,
          stockTotal: 8,
        },
        variantCount: 1,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    await expect(controller.recommendProducts(
      'arc-store',
      'handmade-bag',
      { limit: 6 }
    )).resolves.toEqual({
      items: [
        {
          id: 'product-2',
          shop: {
            id: 'shop-1',
            public_id: 'public-shop-1',
            shop_name: 'Arc Store',
            slug: 'arc-store',
          },
          category_id: 'category-1',
          title: 'Handmade Bag 2',
          slug: 'handmade-bag-2',
          availability: {
            in_stock: true,
            low_stock: false,
            stock_total: 8,
          },
          variant_count: 1,
          created_at: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    });
    expect(recommendPublicProductsUseCase.execute).toHaveBeenCalledWith('arc-store', 'handmade-bag', 6);
  });

  it('returns recommendation sections for a PDP', async () => {
    getPublicProductRecommendationSectionsUseCase.execute.mockResolvedValue([
      {
        type: 'similar_products',
        title: 'Similar products',
        items: [
          {
            id: 'product-2',
            shop: {
              id: 'shop-1',
              publicId: 'public-shop-1',
              shopName: 'Arc Store',
              slug: 'arc-store',
            },
            title: 'Handmade Bag 2',
            slug: 'handmade-bag-2',
            availability: {
              inStock: true,
              lowStock: false,
              stockTotal: 8,
            },
            variantCount: 1,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      },
    ]);

    await expect(controller.getRecommendationSections(
      'arc-store',
      'handmade-bag',
      { limit: 6 }
    )).resolves.toEqual({
      sections: [
        {
          type: 'similar_products',
          title: 'Similar products',
          items: [
            {
              id: 'product-2',
              shop: {
                id: 'shop-1',
                public_id: 'public-shop-1',
                shop_name: 'Arc Store',
                slug: 'arc-store',
              },
              category_id: undefined,
              title: 'Handmade Bag 2',
              slug: 'handmade-bag-2',
              image: undefined,
              variant_type: undefined,
              pricing: undefined,
              availability: {
                in_stock: true,
                low_stock: false,
                stock_total: 8,
              },
              variant_count: 1,
              created_at: new Date('2026-01-01T00:00:00.000Z'),
            },
          ],
        },
      ],
    });
    expect(getPublicProductRecommendationSectionsUseCase.execute).toHaveBeenCalledWith('arc-store', 'handmade-bag', 6);
  });

  it('returns recently viewed products for the current actor', async () => {
    productActivitySessionService.extractSessionId.mockReturnValue('guest-session-1');
    publicProductViewHistoryService.listRecentViews.mockResolvedValue([
      {
        id: 'product-3',
        shop: {
          id: 'shop-1',
          publicId: 'public-shop-1',
          shopName: 'Arc Store',
          slug: 'arc-store',
        },
        title: 'Viewed Product',
        slug: 'viewed-product',
        availability: {
          inStock: true,
          lowStock: false,
          stockTotal: 4,
        },
        variantCount: 1,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);

    await expect(controller.listRecentlyViewedProducts(
      {} as never,
      { limit: 5 }
    )).resolves.toEqual({
      items: [
        {
          id: 'product-3',
          shop: {
            id: 'shop-1',
            public_id: 'public-shop-1',
            shop_name: 'Arc Store',
            slug: 'arc-store',
          },
          title: 'Viewed Product',
          slug: 'viewed-product',
          availability: {
            in_stock: true,
            low_stock: false,
            stock_total: 4,
          },
          variant_count: 1,
          created_at: new Date('2026-01-02T00:00:00.000Z'),
        },
      ],
    });
    expect(publicProductViewHistoryService.listRecentViews).toHaveBeenCalledWith({
      userId: undefined,
      guestSessionId: 'guest-session-1',
      limit: 5,
    });
  });

  it('returns trending products', async () => {
    publicProductViewHistoryService.listTrendingProducts.mockResolvedValue([
      {
        id: 'product-4',
        shop: {
          id: 'shop-1',
          publicId: 'public-shop-1',
          shopName: 'Arc Store',
          slug: 'arc-store',
        },
        title: 'Trending Product',
        slug: 'trending-product',
        availability: {
          inStock: true,
          lowStock: false,
          stockTotal: 11,
        },
        variantCount: 1,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
      },
    ]);

    await expect(controller.listTrendingProducts({ limit: 6 })).resolves.toEqual({
      items: [
        {
          id: 'product-4',
          shop: {
            id: 'shop-1',
            public_id: 'public-shop-1',
            shop_name: 'Arc Store',
            slug: 'arc-store',
          },
          title: 'Trending Product',
          slug: 'trending-product',
          availability: {
            in_stock: true,
            low_stock: false,
            stock_total: 11,
          },
          variant_count: 1,
          created_at: new Date('2026-01-03T00:00:00.000Z'),
        },
      ],
    });
    expect(publicProductViewHistoryService.listTrendingProducts).toHaveBeenCalledWith({
      limit: 6,
    });
  });

  it('returns best-selling products', async () => {
    publicProductOrderHistoryService.listBestSellingProducts.mockResolvedValue([
      {
        id: 'product-5',
        shop: {
          id: 'shop-1',
          publicId: 'public-shop-1',
          shopName: 'Arc Store',
          slug: 'arc-store',
        },
        title: 'Best Seller Product',
        slug: 'best-seller-product',
        availability: {
          inStock: true,
          lowStock: false,
          stockTotal: 15,
        },
        variantCount: 1,
        createdAt: new Date('2026-01-04T00:00:00.000Z'),
      },
    ]);

    await expect(controller.listBestSellingProducts({ limit: 8 })).resolves.toEqual({
      items: [
        {
          id: 'product-5',
          shop: {
            id: 'shop-1',
            public_id: 'public-shop-1',
            shop_name: 'Arc Store',
            slug: 'arc-store',
          },
          title: 'Best Seller Product',
          slug: 'best-seller-product',
          availability: {
            in_stock: true,
            low_stock: false,
            stock_total: 15,
          },
          variant_count: 1,
          created_at: new Date('2026-01-04T00:00:00.000Z'),
        },
      ],
    });
    expect(publicProductOrderHistoryService.listBestSellingProducts).toHaveBeenCalledWith({
      limit: 8,
    });
  });
});
