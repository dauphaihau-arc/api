import { NotFoundException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OptionalJwtAuthGuard } from '~/domains/auth/api/guard/optional-jwt-auth.guard';
import type { GetPublicProductBySlugsUseCase } from '../../../app/use-cases/get-public-product-by-slugs/get-public-product-by-slugs.use-case';
import type { ListPublicProductFacetsUseCase } from '../../../app/use-cases/list-public-product-facets/list-public-product-facets.use-case';
import type { ListPublicProductReviewImagesUseCase } from '../../../app/use-cases/list-public-product-review-images/list-public-product-review-images.use-case';
import type { ListPublicProductReviewsUseCase } from '../../../app/use-cases/list-public-product-reviews/list-public-product-reviews.use-case';
import type { ListPublicProductsUseCase } from '../../../app/use-cases/list-public-products/list-public-products.use-case';
import type { SuggestPublicProductsUseCase } from '../../../app/use-cases/suggest-public-products/suggest-public-products.use-case';
import { ProductVariantType } from '../../../domain/enums/product-variant-type.enum';
import { ProductWhoMade } from '../../../domain/enums/product-who-made.enum';
import { ProductController } from './product.controller';

const listPublicProductsUseCase: Pick<jest.Mocked<ListPublicProductsUseCase>, 'execute'> = {
  execute: jest.fn(),
};
const listPublicProductFacetsUseCase: Pick<jest.Mocked<ListPublicProductFacetsUseCase>, 'execute'> = {
  execute: jest.fn(),
};
const getPublicProductBySlugsUseCase: Pick<jest.Mocked<GetPublicProductBySlugsUseCase>, 'execute'> = {
  execute: jest.fn(),
};
const suggestPublicProductsUseCase: Pick<jest.Mocked<SuggestPublicProductsUseCase>, 'execute'> = {
  execute: jest.fn(),
};
const listPublicProductReviewsUseCase: Pick<jest.Mocked<ListPublicProductReviewsUseCase>, 'execute'> = {
  execute: jest.fn(),
};
const listPublicProductReviewImagesUseCase: Pick<jest.Mocked<ListPublicProductReviewImagesUseCase>, 'execute'> = {
  execute: jest.fn(),
};
const guestRequest = {} as any;
const authenticatedRequest = { user: { userId: 'user-1' } } as any;
const response = {
  setHeader: jest.fn(),
} as any;

describe('ProductController', () => {
  const controller = new ProductController(
    listPublicProductsUseCase as never,
    listPublicProductFacetsUseCase as never,
    getPublicProductBySlugsUseCase as never,
    suggestPublicProductsUseCase as never,
    listPublicProductReviewsUseCase as never,
    listPublicProductReviewImagesUseCase as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers GET by-slug/:shop_slug/:product_slug on the controller method', () => {
    const handler = ProductController.prototype.productBySlugs;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('by-slug/:shop_slug/:product_slug');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });

  it('applies optional auth to public product routes', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ProductController)).toEqual([OptionalJwtAuthGuard]);
  });

  it('registers GET suggestions on the controller method', () => {
    const handler = ProductController.prototype.suggestProducts;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('suggestions');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });

  it('registers GET facets on the controller method', () => {
    const handler = ProductController.prototype.listProductFacets;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('facets');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });

  it('returns public product facets', async () => {
    listPublicProductFacetsUseCase.execute.mockResolvedValue([
      {
        facetKey: 'material',
        attributeName: 'Material',
        options: [
          { optionKey: 'linen', value: 'Linen' },
        ],
      },
    ]);

    await expect(controller.listProductFacets(
      guestRequest,
      response,
      {
        page: '1',
        limit: '12',
        category_id: '19e56f7f-2dbd-4e4b-95fc-99f82f6d5b0e',
        min_price: '20000',
        max_price: '50000',
        attr_material: 'cotton,linen',
      },
    )).resolves.toEqual({
      facets: [
        {
          facet_key: 'material',
          attribute_name: 'Material',
          options: [
            { option_key: 'linen', value: 'Linen' },
          ],
        },
      ],
    });
    expect(listPublicProductFacetsUseCase.execute).toHaveBeenCalledWith({
      page: 1,
      limit: 12,
      categoryId: '19e56f7f-2dbd-4e4b-95fc-99f82f6d5b0e',
      minPrice: 20000,
      maxPrice: 50000,
      attributeFilters: [
        {
          attribute_id: 'material',
          attribute_name: 'material',
          selected_option_keys: ['cotton', 'linen'],
          selected_option_values: ['cotton', 'linen'],
        },
      ],
    });
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=60');
  });

  it('normalizes list product queries before executing the use case', async () => {
    listPublicProductsUseCase.execute.mockResolvedValue({
      items: [],
      meta: {
        page: 1,
        limit: 16,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    await controller.listProducts(
      guestRequest,
      response,
      {
        page: '1',
        limit: '16',
        category_id: '19e56f7f-2dbd-4e4b-95fc-99f82f6d5b0e',
        min_price: '20000',
        max_price: '50000',
        attr_bag_size: 'large',
        attr_color: 'blue,green',
      },
    );

    expect(listPublicProductsUseCase.execute).toHaveBeenCalledWith({
      page: 1,
      limit: 16,
      categoryId: '19e56f7f-2dbd-4e4b-95fc-99f82f6d5b0e',
      minPrice: 20000,
      maxPrice: 50000,
      attributeFilters: [
        {
          attribute_id: 'bag_size',
          attribute_name: 'bag_size',
          selected_option_keys: ['large'],
          selected_option_values: ['large'],
        },
        {
          attribute_id: 'color',
          attribute_name: 'color',
          selected_option_keys: ['blue', 'green'],
          selected_option_values: ['blue', 'green'],
        },
      ],
    });
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=60');
  });

  it('returns free shipping flags on public product list items', async () => {
    const createdAt = new Date('2026-06-11T01:00:00.000Z');
    listPublicProductsUseCase.execute.mockResolvedValue({
      items: [{
        id: 'product-1',
        shop: {
          id: 'shop-1',
          publicId: 'shop-pub-1',
          shopName: 'Olive Atelier',
          slug: 'olive-atelier',
        },
        title: 'Linen Weekend Dress',
        slug: 'linen-weekend-dress',
        availability: {
          inStock: true,
          lowStock: false,
          stockTotal: 12,
        },
        variantCount: 0,
        hasFreeShipping: true,
        createdAt,
      }],
      meta: {
        page: 1,
        limit: 16,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    const result = await controller.listProducts(guestRequest, response, {});

    expect(result.items[0]).toMatchObject({
      id: 'product-1',
      has_free_shipping: true,
    });
  });

  it('returns suggested products for typeahead', async () => {
    suggestPublicProductsUseCase.execute.mockResolvedValue([
      {
        id: 'product-1',
        title: 'Handmade Bag',
        slug: 'handmade-bag',
        shop: {
          id: 'shop-1',
          publicId: 'public-shop-1',
          shopName: 'Arc Store',
          slug: 'arc-store',
        },
      },
    ]);

    await expect(controller.suggestProducts({
      search: 'bag',
      limit: 5,
    })).resolves.toEqual({
      items: [
        {
          id: 'product-1',
          title: 'Handmade Bag',
          slug: 'handmade-bag',
          shop: {
            id: 'shop-1',
            public_id: 'public-shop-1',
            shop_name: 'Arc Store',
            slug: 'arc-store',
          },
        },
      ],
    });
    expect(suggestPublicProductsUseCase.execute).toHaveBeenCalledWith('bag', 5);
  });

  it('returns product detail when looked up by shop slug and product slug', async () => {
    getPublicProductBySlugsUseCase.execute.mockResolvedValue({
      id: 'product-1',
      shop: {
        id: 'shop-1',
        publicId: 'public-shop-1',
        shopName: 'Arc Store',
        slug: 'arc-store',
      },
      categoryId: 'category-1',
      categoryPath: [
        {
          id: 'category-root',
          name: 'Accessories',
          slug: 'accessories',
        },
        {
          id: 'category-1',
          name: 'Handbags',
          slug: 'handbags',
        },
      ],
      title: 'Handmade Bag',
      slug: 'handmade-bag',
      description: 'A detail page payload.',
      whoMade: ProductWhoMade.I_DID,
      isDigital: false,
      variantType: ProductVariantType.SINGLE,
      variantGroupName: 'Color',
      variantSubGroupName: 'Size',
      stockNoticeThreshold: 10,
      reviewSummary: {
        average: 4.5,
        count: 12,
      },
      images: [],
      variants: [],
      inventory: [],
    });

    await expect(controller.productBySlugs(
      guestRequest,
      response,
      'arc-store',
      'handmade-bag',
    )).resolves.toEqual({
      id: 'product-1',
      shop: {
        id: 'shop-1',
        public_id: 'public-shop-1',
        shop_name: 'Arc Store',
        slug: 'arc-store',
      },
      category_id: 'category-1',
      category_path: [
        {
          id: 'category-root',
          name: 'Accessories',
          slug: 'accessories',
        },
        {
          id: 'category-1',
          name: 'Handbags',
          slug: 'handbags',
        },
      ],
      title: 'Handmade Bag',
      slug: 'handmade-bag',
      description: 'A detail page payload.',
      who_made: 'i_did',
      is_digital: false,
      variant_type: 'single',
      variant_group_name: 'Color',
      variant_sub_group_name: 'Size',
      stock_notice_threshold: 10,
      review_summary: {
        average: 4.5,
        count: 12,
      },
      images: [],
      variants: [],
      inventory: [],
      shipping: undefined,
    });
    expect(getPublicProductBySlugsUseCase.execute).toHaveBeenCalledWith(
      'arc-store',
      'handmade-bag',
    );
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=60');
  });

  it('throws when the product does not exist', async () => {
    getPublicProductBySlugsUseCase.execute.mockResolvedValue(null);

    await expect(controller.productBySlugs(
      guestRequest,
      response,
      'missing-shop',
      'missing-product',
    )).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('marks auth-backed product responses as private', async () => {
    listPublicProductsUseCase.execute.mockResolvedValue({
      items: [],
      meta: {
        page: 1,
        limit: 16,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    await controller.listProducts(authenticatedRequest, response, {});

    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });

  it('returns public product reviews', async () => {
    listPublicProductReviewsUseCase.execute.mockResolvedValue({
      summary: {
        average: 5,
        count: 1,
        breakdown: {
          1: 0, 2: 0, 3: 0, 4: 0, 5: 1, 
        },
        filters: {
          hasImages: 1,
          hasComment: 1,
        },
      },
      items: [
        {
          id: 'review-1',
          rating: 5,
          title: 'Great',
          body: 'Loved it',
          images: [
            {
              id: 'image-1',
              storageKey: 'dev/public/users/u1/product-reviews/item-1/images/img/original.jpg',
              url: 'https://cdn.example.test/review.jpg',
              rank: 1,
            },
          ],
          createdAt: new Date('2026-06-18T00:00:00.000Z'),
          updatedAt: new Date('2026-06-18T00:00:00.000Z'),
          verifiedPurchase: true,
          author: {
            displayName: 'buyer',
          },
        },
      ],
      meta: {
        page: 1,
        limit: 12,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    await expect(controller.listProductReviews('arc-store', 'handmade-bag', {})).resolves.toEqual({
      summary: {
        average: 5,
        count: 1,
        breakdown: {
          1: 0, 2: 0, 3: 0, 4: 0, 5: 1, 
        },
        filters: {
          has_images: 1,
          has_comment: 1,
        },
      },
      items: [
        {
          id: 'review-1',
          rating: 5,
          title: 'Great',
          body: 'Loved it',
          image: {
            id: 'image-1',
            url: 'https://cdn.example.test/review.jpg',
            rank: 1,
          },
          created_at: new Date('2026-06-18T00:00:00.000Z'),
          updated_at: new Date('2026-06-18T00:00:00.000Z'),
          verified_purchase: true,
          author: {
            display_name: 'buyer',
          },
        },
      ],
      meta: {
        page: 1,
        limit: 12,
        total: 1,
        total_pages: 1,
        has_next_page: false,
        has_previous_page: false,
      },
    });
  });

  it('passes review filters through to the use case', async () => {
    listPublicProductReviewsUseCase.execute.mockResolvedValue({
      summary: {
        average: 0,
        count: 0,
        breakdown: {
          1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 
        },
        filters: {
          hasImages: 0,
          hasComment: 0,
        },
      },
      items: [],
      meta: {
        page: 1,
        limit: 12,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    await controller.listProductReviews('arc-store', 'handmade-bag', {
      page: 2,
      limit: 4,
      sort: 'highest_rating',
      rating: 5,
      hasImages: true,
      hasComment: true,
    });

    expect(listPublicProductReviewsUseCase.execute).toHaveBeenCalledWith({
      shopSlug: 'arc-store',
      productSlug: 'handmade-bag',
      page: 2,
      limit: 4,
      sort: 'highest_rating',
      rating: 5,
      hasImages: true,
      hasComment: true,
    });
  });

  it('returns public product review images', async () => {
    listPublicProductReviewImagesUseCase.execute.mockResolvedValue({
      items: [
        {
          id: 'image-1',
          storageKey: 'dev/public/users/u1/product-reviews/item-1/images/img/original.jpg',
          url: 'https://cdn.example.test/review.jpg',
          rank: 1,
          reviewId: 'review-1',
          reviewTitle: 'Great',
          createdAt: new Date('2026-06-18T00:00:00.000Z'),
          author: {
            displayName: 'buyer',
          },
        },
      ],
      meta: {
        nextCursor: 'cursor-2',
        hasMore: true,
      },
    });

    await expect(controller.listProductReviewImages('arc-store', 'handmade-bag', {})).resolves.toEqual({
      items: [
        {
          id: 'image-1',
          url: 'https://cdn.example.test/review.jpg',
          rank: 1,
          review_id: 'review-1',
          review_title: 'Great',
          created_at: new Date('2026-06-18T00:00:00.000Z'),
          author: {
            display_name: 'buyer',
          },
        },
      ],
      meta: {
        next_cursor: 'cursor-2',
        has_more: true,
      },
    });
    expect(listPublicProductReviewImagesUseCase.execute).toHaveBeenCalledWith({
      shopSlug: 'arc-store',
      productSlug: 'handmade-bag',
      limit: undefined,
      cursor: undefined,
    });
  });
});
