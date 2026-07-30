import type { EntityManager } from '@mikro-orm/postgresql';
import { ProductReviewStatus } from '../../../domain/enums/product-review-status.enum';
import {
  ProductReviewEditLimitExceededError,
  ProductReviewNotEligibleError,
} from '../../errors/product-app.error';
import { UpsertMyProductReviewUseCase } from './upsert-my-product-review.use-case';
import { OrderShippingStatus } from '~/domains/order/domain/enums/order-shipping-status.enum';
import { OrderStatus } from '~/domains/order/domain/enums/order-status.enum';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';

// The scenarios here are intentionally exhaustive; splitting them further hurts test readability.
// eslint-disable-next-line max-lines-per-function
describe('UpsertMyProductReviewUseCase', () => {
  const jobDispatcher = {
    dispatch: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a published review with images and refreshes product aggregates', async () => {
    const orderItem = {
      id: 'item-1',
      title: 'Handmade Bag',
      product: {
        id: 'product-1',
        slug: 'handmade-bag',
        shop: {
          slug: 'arc-store',
        },
      },
      order: {
        id: 'order-1',
        status: OrderStatus.COMPLETED,
        shippingStatus: OrderShippingStatus.DELIVERED,
      },
    };

    const reviewRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((input) => ({
        id: 'review-1',
        createdAt: new Date('2026-06-18T00:00:00.000Z'),
        updatedAt: new Date('2026-06-18T00:00:00.000Z'),
        images: {
          removeAll: jest.fn(),
          add: jest.fn(),
          getItems: jest.fn(() => [
            {
              id: 'image-1',
              storageKey: 'dev/public/users/user-1/products/item-1/images/product-reviews/img-1/original.jpg',
              rank: 1,
              variantStatus: 'pending',
              variantError: undefined,
              variantsGeneratedAt: undefined,
              variants: {
                getItems: jest.fn(() => []),
              },
            },
          ]),
        },
        ...input,
      })),
    };

    const fakeEntityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        switch (entity?.name) {
          case 'OrderItemEntity':
            return {
              findOne: jest.fn().mockResolvedValue(orderItem),
            };
          case 'ProductReviewEntity':
            return reviewRepository;
          default:
            return {};
        }
      }),
      create: jest.fn((_entity, input) => ({
        id: `image-${input.rank}`,
        ...input,
      })),
      persistAndFlush: jest.fn().mockResolvedValue(undefined),
      getConnection: jest.fn(() => ({
        execute: jest.fn()
          .mockResolvedValueOnce([{ average_rating: '5.0', review_count: 1 }])
          .mockResolvedValueOnce(undefined),
      })),
    } as unknown as EntityManager;

    const entityManager = {
      fork: jest.fn(() => fakeEntityManager),
    } as unknown as EntityManager;

    const catalogProductProjectorService = {
      projectProduct: jest.fn().mockResolvedValue(undefined),
    };

    const storageService = {
      getPublicUrl: jest.fn((key: string) => `https://cdn.example.test/${key}`),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const cacheManager = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    };

    const useCase = new UpsertMyProductReviewUseCase(
      entityManager,
      catalogProductProjectorService as never,
      storageService as never,
      {
        getPending: jest.fn().mockResolvedValue({ sizeBytes: 123 }),
        clearPending: jest.fn().mockResolvedValue(undefined),
      } as never,
      jobDispatcher as never,
      { recalculateForProduct: jest.fn().mockResolvedValue(undefined) } as never,
      cacheManager as never,
    );

    const result = await useCase.execute(
      {
        userId: 'user-1',
        email: 'buyer@example.com',
        status: UserStatus.ACTIVE,
        sessionId: 'session-1',
        roles: [],
        permissions: [],
      },
      'item-1',
      {
        rating: 5,
        title: ' Great ',
        body: ' Loved it ',
        imageKeys: ['dev/public/users/user-1/products/item-1/images/product-reviews/img-1/original.jpg'],
      },
    );

    expect(result.rating).toBe(5);
    expect(result.title).toBe('Great');
    expect(result.body).toBe('Loved it');
    expect(result.status).toBe(ProductReviewStatus.PUBLISHED);
    expect(result.images).toHaveLength(1);
    expect(catalogProductProjectorService.projectProduct).toHaveBeenCalledWith('product-1');
    expect(storageService.deleteObject).not.toHaveBeenCalled();
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      'product-review.generate-image-variants',
      { reviewImageId: 'image-1' },
      expect.objectContaining({
        deduplicationKey: expect.stringContaining('image-1'),
      }),
    );
  });

  it('rejects order items that are not review-eligible', async () => {
    const fakeEntityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        if (entity?.name === 'OrderItemEntity') {
          return {
            findOne: jest.fn().mockResolvedValue({
              id: 'item-1',
              product: {
                id: 'product-1',
                slug: 'handmade-bag',
                shop: { slug: 'arc-store' },
              },
              order: {
                id: 'order-1',
                status: OrderStatus.PAID,
                shippingStatus: OrderShippingStatus.PRE_TRANSIT,
              },
            }),
          };
        }

        return {};
      }),
    } as unknown as EntityManager;

    const entityManager = {
      fork: jest.fn(() => fakeEntityManager),
    } as unknown as EntityManager;

    const useCase = new UpsertMyProductReviewUseCase(
      entityManager,
      { projectProduct: jest.fn() } as never,
      { getPublicUrl: jest.fn() } as never,
      {
        getPending: jest.fn().mockResolvedValue(undefined),
        clearPending: jest.fn().mockResolvedValue(undefined),
      } as never,
      jobDispatcher as never,
      { recalculateForProduct: jest.fn().mockResolvedValue(undefined) } as never,
      { get: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(
      useCase.execute(
        {
          userId: 'user-1',
          email: 'buyer@example.com',
          status: UserStatus.ACTIVE,
          sessionId: 'session-1',
          roles: [],
          permissions: [],
        },
        'item-1',
        { rating: 4 },
      ),
    ).rejects.toBeInstanceOf(ProductReviewNotEligibleError);
  });

  it('rejects image keys outside the buyer-owned review prefix', async () => {
    const fakeEntityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        if (entity?.name === 'OrderItemEntity') {
          return {
            findOne: jest.fn().mockResolvedValue({
              id: 'item-1',
              title: 'Handmade Bag',
              product: {
                id: 'product-1',
                slug: 'handmade-bag',
                shop: { slug: 'arc-store' },
              },
              order: {
                id: 'order-1',
                status: OrderStatus.COMPLETED,
                shippingStatus: OrderShippingStatus.DELIVERED,
              },
            }),
          };
        }

        if (entity?.name === 'ProductReviewEntity') {
          return {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn((input) => ({
              id: 'review-1',
              createdAt: new Date(),
              updatedAt: new Date(),
              images: {
                removeAll: jest.fn(),
                add: jest.fn(),
                getItems: jest.fn(() => []),
              },
              ...input,
            })),
          };
        }

        return {};
      }),
    } as unknown as EntityManager;

    const useCase = new UpsertMyProductReviewUseCase(
      { fork: jest.fn(() => fakeEntityManager) } as unknown as EntityManager,
      { projectProduct: jest.fn() } as never,
      { getPublicUrl: jest.fn(), deleteObject: jest.fn() } as never,
      {
        getPending: jest.fn().mockResolvedValue(undefined),
        clearPending: jest.fn().mockResolvedValue(undefined),
      } as never,
      jobDispatcher as never,
      { recalculateForProduct: jest.fn().mockResolvedValue(undefined) } as never,
      { get: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(
      useCase.execute(
        {
          userId: 'user-1',
          email: 'buyer@example.com',
          status: UserStatus.ACTIVE,
          sessionId: 'session-1',
          roles: [],
          permissions: [],
        },
        'item-1',
        {
          rating: 5,
          imageKeys: ['dev/public/users/other-user/products/item-1/images/product-reviews/img/original.jpg'],
        },
      ),
    ).rejects.toThrow('Review image key is not valid for this order item');
  });

  it('reuses the same review for the same product across separate purchases', async () => {
    const existingReview = {
      id: 'review-1',
      createdAt: new Date('2026-06-18T00:00:00.000Z'),
      updatedAt: new Date('2026-06-18T12:00:00.000Z'),
      product: { id: 'product-1' },
      user: 'user-1',
      order: { id: 'order-old' },
      orderItem: { id: 'item-old' },
      rating: 4,
      title: 'Before',
      body: 'Before body',
      status: ProductReviewStatus.PUBLISHED,
      images: {
        removeAll: jest.fn(),
        add: jest.fn(),
        getItems: jest.fn(() => []),
      },
    };

    const orderItem = {
      id: 'item-2',
      title: 'Handmade Bag',
      product: {
        id: 'product-1',
        slug: 'handmade-bag',
        shop: { slug: 'arc-store' },
      },
      order: {
        id: 'order-2',
        status: OrderStatus.COMPLETED,
        shippingStatus: OrderShippingStatus.DELIVERED,
      },
    };

    const reviewRepository = {
      findOne: jest.fn()
        .mockResolvedValueOnce(existingReview),
    };

    const fakeEntityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        switch (entity?.name) {
          case 'OrderItemEntity':
            return {
              findOne: jest.fn().mockResolvedValue(orderItem),
            };
          case 'ProductReviewEntity':
            return reviewRepository;
          default:
            return {};
        }
      }),
      create: jest.fn((_entity, input) => ({ id: 'image-1', ...input })),
      persistAndFlush: jest.fn().mockResolvedValue(undefined),
      getConnection: jest.fn(() => ({
        execute: jest.fn()
          .mockResolvedValueOnce([{ average_rating: '5.0', review_count: 1 }])
          .mockResolvedValueOnce(undefined),
      })),
    } as unknown as EntityManager;

    const useCase = new UpsertMyProductReviewUseCase(
      { fork: jest.fn(() => fakeEntityManager) } as unknown as EntityManager,
      { projectProduct: jest.fn().mockResolvedValue(undefined) } as never,
      { getPublicUrl: jest.fn(), deleteObject: jest.fn().mockResolvedValue(undefined) } as never,
      {
        getPending: jest.fn().mockResolvedValue(undefined),
        clearPending: jest.fn().mockResolvedValue(undefined),
      } as never,
      jobDispatcher as never,
      { recalculateForProduct: jest.fn().mockResolvedValue(undefined) } as never,
      { get: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined) } as never,
    );

    const result = await useCase.execute(
      {
        userId: 'user-1',
        email: 'buyer@example.com',
        status: UserStatus.ACTIVE,
        sessionId: 'session-1',
        roles: [],
        permissions: [],
      },
      'item-2',
      { rating: 5, title: 'Updated' },
    );

    expect(reviewRepository.findOne).toHaveBeenCalledWith(
      { product: 'product-1', user: 'user-1' },
      { populate: ['images', 'images.variants'] },
    );
    expect(existingReview.order).toBe(orderItem.order);
    expect(existingReview.orderItem).toBe(orderItem);
    expect(result.id).toBe('review-1');
    expect(result.orderItemId).toBe('item-2');
  });

  it('flushes removed review images before inserting replacement ranks on update', async () => {
    const events: string[] = [];
    const existingReview = {
      id: 'review-1',
      createdAt: new Date('2026-06-18T00:00:00.000Z'),
      updatedAt: new Date('2026-06-18T12:00:00.000Z'),
      product: { id: 'product-1' },
      user: 'user-1',
      order: { id: 'order-old' },
      orderItem: { id: 'item-old' },
      rating: 4,
      title: 'Before',
      body: 'Before body',
      status: ProductReviewStatus.PUBLISHED,
      images: {
        removeAll: jest.fn(() => {
          events.push('removeAll');
        }),
        add: jest.fn(() => {
          events.push('add');
        }),
        getItems: jest.fn(() => [
          {
            id: 'existing-image-1',
            storageKey: 'dev/public/shops/noirvember/products/zoom-cortez-x-sacai-iron-grey/images/reviews/user-1/old/original.png',
            sizeBytes: 111,
            rank: 1,
            variants: {
              getItems: jest.fn(() => []),
            },
          },
        ]),
      },
    };

    const orderItem = {
      id: 'item-2',
      title: 'Handmade Bag',
      product: {
        id: 'product-1',
        slug: 'handmade-bag',
        shop: { slug: 'arc-store' },
      },
      order: {
        id: 'order-2',
        status: OrderStatus.COMPLETED,
        shippingStatus: OrderShippingStatus.DELIVERED,
      },
    };

    const fakeEntityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        switch (entity?.name) {
          case 'OrderItemEntity':
            return {
              findOne: jest.fn().mockResolvedValue(orderItem),
            };
          case 'ProductReviewEntity':
            return {
              findOne: jest.fn().mockResolvedValue(existingReview),
            };
          default:
            return {};
        }
      }),
      create: jest.fn((_entity, input) => ({ id: 'image-1', ...input })),
      flush: jest.fn().mockImplementation(async () => {
        events.push('flush');
      }),
      persistAndFlush: jest.fn().mockResolvedValue(undefined),
      getConnection: jest.fn(() => ({
        execute: jest.fn()
          .mockResolvedValueOnce([{ average_rating: '5.0', review_count: 1 }])
          .mockResolvedValueOnce(undefined),
      })),
    } as unknown as EntityManager;

    const useCase = new UpsertMyProductReviewUseCase(
      { fork: jest.fn(() => fakeEntityManager) } as unknown as EntityManager,
      { projectProduct: jest.fn().mockResolvedValue(undefined) } as never,
      {
        getPublicUrl: jest.fn((key: string) => `https://cdn.example.test/${key}`),
        deleteObject: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        getPending: jest.fn().mockResolvedValue({ sizeBytes: 222 }),
        clearPending: jest.fn().mockResolvedValue(undefined),
      } as never,
      jobDispatcher as never,
      { recalculateForProduct: jest.fn().mockResolvedValue(undefined) } as never,
      { get: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await useCase.execute(
      {
        userId: 'user-1',
        email: 'buyer@example.com',
        status: UserStatus.ACTIVE,
        sessionId: 'session-1',
        roles: [],
        permissions: [],
      },
      'item-2',
      {
        rating: 5,
        imageKeys: ['dev/public/users/user-1/products/item-2/images/product-reviews/new/original.png'],
      },
    );

    expect(events).toEqual(['removeAll', 'flush', 'add']);
    expect((fakeEntityManager as unknown as { flush: jest.Mock }).flush).toHaveBeenCalledTimes(1);
  });

  it('rejects the sixth edit within the same day for an existing review', async () => {
    const existingReview = {
      id: 'review-1',
      createdAt: new Date('2026-06-18T00:00:00.000Z'),
      updatedAt: new Date('2026-06-18T12:00:00.000Z'),
      product: { id: 'product-1' },
      user: 'user-1',
      order: { id: 'order-old' },
      orderItem: { id: 'item-old' },
      rating: 4,
      title: 'Before',
      body: 'Before body',
      status: ProductReviewStatus.PUBLISHED,
      images: {
        removeAll: jest.fn(),
        add: jest.fn(),
        getItems: jest.fn(() => []),
      },
    };

    const orderItem = {
      id: 'item-2',
      title: 'Handmade Bag',
      product: {
        id: 'product-1',
        slug: 'handmade-bag',
        shop: { slug: 'arc-store' },
      },
      order: {
        id: 'order-2',
        status: OrderStatus.COMPLETED,
        shippingStatus: OrderShippingStatus.DELIVERED,
      },
    };

    const fakeEntityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        switch (entity?.name) {
          case 'OrderItemEntity':
            return {
              findOne: jest.fn().mockResolvedValue(orderItem),
            };
          case 'ProductReviewEntity':
            return {
              findOne: jest.fn().mockResolvedValue(existingReview),
            };
          default:
            return {};
        }
      }),
    } as unknown as EntityManager;

    const useCase = new UpsertMyProductReviewUseCase(
      { fork: jest.fn(() => fakeEntityManager) } as unknown as EntityManager,
      { projectProduct: jest.fn() } as never,
      { getPublicUrl: jest.fn(), deleteObject: jest.fn() } as never,
      {
        getPending: jest.fn().mockResolvedValue(undefined),
        clearPending: jest.fn().mockResolvedValue(undefined),
      } as never,
      jobDispatcher as never,
      { recalculateForProduct: jest.fn().mockResolvedValue(undefined) } as never,
      { get: jest.fn().mockResolvedValue(5), set: jest.fn() } as never,
    );

    await expect(
      useCase.execute(
        {
          userId: 'user-1',
          email: 'buyer@example.com',
          status: UserStatus.ACTIVE,
          sessionId: 'session-1',
          roles: [],
          permissions: [],
        },
        'item-2',
        { rating: 5 },
      ),
    ).rejects.toBeInstanceOf(ProductReviewEditLimitExceededError);
  });
});
