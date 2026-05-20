import { NotFoundException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ProductController } from './product.controller';

describe('ProductController', () => {
  const listPublicProductsUseCase = { execute: jest.fn() } as never;
  const getPublicProductBySlugsUseCase = { execute: jest.fn() } as never;

  const controller = new ProductController(
    listPublicProductsUseCase,
    getPublicProductBySlugsUseCase
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers GET by-slug/:shopSlug/:productSlug on the controller method', () => {
    const handler = ProductController.prototype.productBySlugs;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('by-slug/:shopSlug/:productSlug');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
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
      whoMade: 'i_did',
      isDigital: false,
      variantType: 'single',
      variantGroupName: 'Color',
      variantSubGroupName: 'Size',
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
});
