import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AUTH_REQUIRED_PERMISSIONS_KEY } from '~/platform/decorators/require-permissions.decorator';
import { ProductReviewStatus } from '~/domains/product/domain/enums/product-review-status.enum';
import { ShopProductReviewsController } from './shop-product-reviews.controller';

describe('ShopProductReviewsController', () => {
  const shopRepository = {
    findOwnedById: jest.fn(),
    findById: jest.fn(),
  };
  const listShopProductReviewsUseCase = {
    execute: jest.fn(),
  };

  const controller = new ShopProductReviewsController(
    shopRepository as never,
    listShopProductReviewsUseCase as never,
  );

  const currentUser = {
    userId: 'user-1',
    email: 'seller@example.com',
    status: 'active',
    sessionId: 'session-1',
    roles: [],
    permissions: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    shopRepository.findOwnedById.mockResolvedValue({ id: 'shop-1' });
  });

  it('requires shop management permissions', () => {
    expect(
      Reflect.getMetadata(AUTH_REQUIRED_PERMISSIONS_KEY, ShopProductReviewsController),
    ).toEqual(['shops.manage']);
  });

  it('registers GET on the controller root path', () => {
    const handler = ShopProductReviewsController.prototype.list;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });

  it('returns shop review list in snake_case', async () => {
    listShopProductReviewsUseCase.execute.mockResolvedValue({
      items: [
        {
          id: 'review-1',
          orderId: 'order-1',
          orderItemId: 'item-1',
          rating: 5,
          title: 'Great',
          body: 'Loved it',
          status: ProductReviewStatus.PUBLISHED,
          images: [
            {
              id: 'image-1',
              storageKey: 'reviews/image-1.jpg',
              url: 'https://cdn.example.test/reviews/image-1.jpg',
              rank: 1,
            },
          ],
          createdAt: new Date('2026-06-18T00:00:00.000Z'),
          updatedAt: new Date('2026-06-18T01:00:00.000Z'),
          author: {
            id: 'buyer-1',
            displayName: 'buyer',
            email: 'buyer@example.com',
          },
          product: {
            id: 'product-1',
            title: 'Handmade Bag',
            slug: 'handmade-bag',
          },
        },
      ],
      counts: {
        all: 3,
        published: 2,
        hidden: 1,
      },
      meta: {
        page: 1,
        limit: 20,
        total: 3,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    await expect(controller.list(
      currentUser as never,
      'shop-1',
      {
        page: 1,
        limit: 20,
        status: ProductReviewStatus.PUBLISHED,
        productId: 'product-1',
        sort: 'newest',
      },
    )).resolves.toEqual({
      items: [
        {
          id: 'review-1',
          order_id: 'order-1',
          order_item_id: 'item-1',
          rating: 5,
          title: 'Great',
          body: 'Loved it',
          status: 'published',
          images: [
            {
              id: 'image-1',
              storage_key: 'reviews/image-1.jpg',
              url: 'https://cdn.example.test/reviews/image-1.jpg',
              rank: 1,
            },
          ],
          created_at: new Date('2026-06-18T00:00:00.000Z'),
          updated_at: new Date('2026-06-18T01:00:00.000Z'),
          author: {
            id: 'buyer-1',
            display_name: 'buyer',
            email: 'buyer@example.com',
          },
          product: {
            id: 'product-1',
            title: 'Handmade Bag',
            slug: 'handmade-bag',
          },
        },
      ],
      counts: {
        all: 3,
        published: 2,
        hidden: 1,
      },
      meta: {
        page: 1,
        limit: 20,
        total: 3,
        total_pages: 1,
        has_next_page: false,
        has_previous_page: false,
      },
    });
  });
});
