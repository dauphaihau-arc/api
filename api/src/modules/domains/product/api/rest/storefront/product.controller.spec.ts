import { NotFoundException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OptionalJwtAuthGuard } from '~/modules/domains/auth/api/guard/optional-jwt-auth.guard';
import type { GetPublicProductBySlugsUseCase } from '../../../app/use-cases/get-public-product-by-slugs/get-public-product-by-slugs.use-case';
import type { ListPublicProductsUseCase } from '../../../app/use-cases/list-public-products/list-public-products.use-case';
import type { SuggestPublicProductsUseCase } from '../../../app/use-cases/suggest-public-products/suggest-public-products.use-case';
import { ProductVariantType } from '../../../domain/enums/product-variant-type.enum';
import { ProductWhoMade } from '../../../domain/enums/product-who-made.enum';
import { ProductController } from './product.controller';

describe('ProductController', () => {
  const listPublicProductsUseCase: Pick<jest.Mocked<ListPublicProductsUseCase>, 'execute' | 'executeFacets'> = {
    execute: jest.fn(),
    executeFacets: jest.fn(),
  };
  const getPublicProductBySlugsUseCase: Pick<jest.Mocked<GetPublicProductBySlugsUseCase>, 'execute'> = {
    execute: jest.fn(),
  };
  const suggestPublicProductsUseCase: Pick<jest.Mocked<SuggestPublicProductsUseCase>, 'execute'> = {
    execute: jest.fn(),
  };

  const controller = new ProductController(
    listPublicProductsUseCase as never,
    getPublicProductBySlugsUseCase as never,
    suggestPublicProductsUseCase as never
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
    listPublicProductsUseCase.executeFacets.mockResolvedValue([
      {
        facetKey: 'material',
        attributeName: 'Material',
        options: [
          { optionKey: 'linen', value: 'Linen' },
        ],
      },
    ]);

    await expect(controller.listProductFacets({
      page: '1',
      limit: '12',
      category_id: '19e56f7f-2dbd-4e4b-95fc-99f82f6d5b0e',
      min_price: '20000',
      max_price: '50000',
      attr_material: 'cotton,linen',
    })).resolves.toEqual({
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
    expect(listPublicProductsUseCase.executeFacets).toHaveBeenCalledWith({
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

    await controller.listProducts({
      page: '1',
      limit: '16',
      category_id: '19e56f7f-2dbd-4e4b-95fc-99f82f6d5b0e',
      min_price: '20000',
      max_price: '50000',
      attr_bag_size: 'large',
      attr_color: 'blue,green',
    });

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
      title: 'Handmade Bag',
      slug: 'handmade-bag',
      description: 'A detail page payload.',
      whoMade: ProductWhoMade.I_DID,
      isDigital: false,
      variantType: ProductVariantType.SINGLE,
      variantGroupName: 'Color',
      variantSubGroupName: 'Size',
      stockNoticeThreshold: 10,
      images: [],
      variants: [],
      inventory: [],
    });

    await expect(controller.productBySlugs('arc-store', 'handmade-bag')).resolves.toEqual({
      id: 'product-1',
      shop: {
        id: 'shop-1',
        public_id: 'public-shop-1',
        shop_name: 'Arc Store',
        slug: 'arc-store',
      },
      category_id: 'category-1',
      title: 'Handmade Bag',
      slug: 'handmade-bag',
      description: 'A detail page payload.',
      who_made: 'i_did',
      is_digital: false,
      variant_type: 'single',
      variant_group_name: 'Color',
      variant_sub_group_name: 'Size',
      stock_notice_threshold: 10,
      images: [],
      variants: [],
      inventory: [],
      shipping: undefined,
    });
    expect(getPublicProductBySlugsUseCase.execute).toHaveBeenCalledWith(
      'arc-store',
      'handmade-bag'
    );
  });

  it('throws when the product does not exist', async () => {
    getPublicProductBySlugsUseCase.execute.mockResolvedValue(null);

    await expect(controller.productBySlugs('missing-shop', 'missing-product')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
