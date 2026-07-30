import type { EntityManager } from '@mikro-orm/postgresql';
import type { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { MikroOrmPublicProductReviewQueryRepository } from './mikro-orm-public-product-review-query.repository';

describe('MikroOrmPublicProductReviewQueryRepository', () => {
  function buildRepository() {
    const execute = jest.fn();
    const connection = { execute };
    const entityManager = {
      fork: jest.fn(() => ({
        getConnection: () => connection,
      })),
    } as unknown as EntityManager;
    const storageService = {
      getPublicUrl: jest.fn((key: string) => `https://cdn.example.test/${key}`),
    } as unknown as StorageService;

    return {
      repository: new MikroOrmPublicProductReviewQueryRepository(entityManager, storageService),
      execute,
      storageService,
    };
  }

  it('normalizes raw review image timestamps before encoding the next cursor', async () => {
    const { repository, execute } = buildRepository();

    execute
      .mockResolvedValueOnce([{
        product_id: 'product-1',
        rating_average: '4.9',
        review_count: '2',
      }])
      .mockResolvedValueOnce([
        {
          id: 'image-1',
          review_id: 'review-2',
          review_title: 'Excellent',
          storage_key: 'reviews/image-1.jpg',
          rank: 1,
          created_at: '2026-06-18T00:00:00.000Z',
          display_name: 'buyer-1',
        },
        {
          id: 'image-2',
          review_id: 'review-1',
          review_title: 'Great',
          storage_key: 'reviews/image-2.jpg',
          rank: 2,
          created_at: '2026-06-17T00:00:00.000Z',
          display_name: 'buyer-2',
        },
      ])
      .mockResolvedValueOnce([{
        product_review_image_id: 'image-1',
        id: 'variant-1',
        variant: 'card_1x1',
        storage_key: 'reviews/image-1/card_1x1.webp',
        width: 600,
        height: 600,
        format: 'webp',
      }]);

    const result = await repository.listPublicImagesByProductSlug({
      shopSlug: 'arc-store',
      productSlug: 'handmade-bag',
      limit: 1,
    });

    expect(result).toEqual({
      items: [{
        id: 'image-1',
        storageKey: 'reviews/image-1.jpg',
        url: 'https://cdn.example.test/reviews/image-1.jpg',
        rank: 1,
        variants: [{
          id: 'variant-1',
          variant: 'card_1x1',
          storageKey: 'reviews/image-1/card_1x1.webp',
          url: 'https://cdn.example.test/reviews/image-1/card_1x1.webp',
          width: 600,
          height: 600,
          format: 'webp',
        }],
        reviewId: 'review-2',
        reviewTitle: 'Excellent',
        createdAt: new Date('2026-06-18T00:00:00.000Z'),
        author: {
          displayName: 'buyer-1',
        },
      }],
      meta: {
        nextCursor: Buffer.from(JSON.stringify({
          createdAt: '2026-06-18T00:00:00.000Z',
          reviewId: 'review-2',
          rank: 1,
          imageId: 'image-1',
        })).toString('base64url'),
        hasMore: true,
      },
    });
  });

  it('normalizes raw review timestamps in the paginated review list', async () => {
    const { repository, execute } = buildRepository();

    execute
      .mockResolvedValueOnce([{
        product_id: 'product-1',
        rating_average: '4.9',
        review_count: '1',
      }])
      .mockResolvedValueOnce([{ rating: 5, count: '1' }])
      .mockResolvedValueOnce([{ count: '1' }])
      .mockResolvedValueOnce([{ count: '1' }])
      .mockResolvedValueOnce([{ count: '1' }])
      .mockResolvedValueOnce([{
        id: 'review-1',
        rating: 5,
        title: 'Great',
        body: 'Loved it',
        created_at: '2026-06-18T00:00:00.000Z',
        updated_at: '2026-06-19T00:00:00.000Z',
        display_name: 'buyer',
      }])
      .mockResolvedValueOnce([{
        review_id: 'review-1',
        id: 'image-1',
        storage_key: 'reviews/image-1.jpg',
        size_bytes: 2048,
        rank: 1,
        variant_status: 'ready',
        variant_error: null,
        variants_generated_at: '2026-06-19T01:00:00.000Z',
      }])
      .mockResolvedValueOnce([{
        product_review_image_id: 'image-1',
        id: 'variant-1',
        variant: 'thumb_1x1',
        storage_key: 'reviews/image-1/thumb_1x1.webp',
        width: 200,
        height: 200,
        format: 'webp',
      }]);

    const result = await repository.listPublicByProductSlug({
      shopSlug: 'arc-store',
      productSlug: 'handmade-bag',
      page: 1,
      limit: 12,
      sort: 'newest',
    });

    expect(result?.items[0]).toEqual({
      id: 'review-1',
      rating: 5,
      title: 'Great',
      body: 'Loved it',
      images: [{
        id: 'image-1',
        storageKey: 'reviews/image-1.jpg',
        url: 'https://cdn.example.test/reviews/image-1.jpg',
        sizeBytes: 2048,
        rank: 1,
        variantStatus: 'ready',
        variantsGeneratedAt: new Date('2026-06-19T01:00:00.000Z'),
        variants: [{
          id: 'variant-1',
          variant: 'thumb_1x1',
          storageKey: 'reviews/image-1/thumb_1x1.webp',
          url: 'https://cdn.example.test/reviews/image-1/thumb_1x1.webp',
          width: 200,
          height: 200,
          format: 'webp',
        }],
      }],
      createdAt: new Date('2026-06-18T00:00:00.000Z'),
      updatedAt: new Date('2026-06-19T00:00:00.000Z'),
      verifiedPurchase: true,
      author: {
        displayName: 'buyer',
      },
    });
  });
});
