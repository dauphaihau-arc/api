import { NotFoundException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ProductController } from './product.controller';

describe('ProductController', () => {
  const listPublicProductsUseCase = { execute: jest.fn() } as never;
  const getPublicProductByIdUseCase = { execute: jest.fn() } as never;

  const controller = new ProductController(
    listPublicProductsUseCase,
    getPublicProductByIdUseCase
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers GET :id on the controller method', () => {
    const handler = ProductController.prototype.product;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':id');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });

  it('returns product detail in snake_case for the HTTP boundary', async () => {
    getPublicProductByIdUseCase.execute.mockResolvedValue({
      id: 'product-1',
      shop: {
        id: 'shop-1',
        publicId: 'public-shop-1',
        shopName: 'Arc Store',
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
      images: [
        {
          id: 'image-1',
          storageKey: 'products/product-1/image-1.jpg',
          url: 'https://cdn.example.com/image-1.jpg',
          rank: 1,
        },
      ],
      variants: [
        {
          id: 'variant-1',
          name: 'Red / Small',
          optionValue1: 'Red',
          optionValue2: 'Small',
          imageStorageKey: 'products/product-1/variant-1.jpg',
          rank: 1,
        },
      ],
      inventory: [
        {
          id: 'inventory-1',
          productVariantId: 'variant-1',
          sku: 'SKU-1',
          stock: 5,
          price: 1200,
          salePrice: 1000,
        },
      ],
      shipping: {
        originCountry: 'VN',
        processTimeLabel: '1-2 days',
        destinations: [
          {
            id: 'destination-1',
            countryCode: 'US',
            deliveryTimeLabel: '5-7 days',
            service: 'Standard',
            chargeType: 'fixed',
            rank: 1,
          },
        ],
      },
    });

    await expect(controller.product('product-1')).resolves.toEqual({
      id: 'product-1',
      shop: {
        id: 'shop-1',
        public_id: 'public-shop-1',
        shop_name: 'Arc Store',
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
      images: [
        {
          id: 'image-1',
          storage_key: 'products/product-1/image-1.jpg',
          url: 'https://cdn.example.com/image-1.jpg',
          rank: 1,
        },
      ],
      variants: [
        {
          id: 'variant-1',
          name: 'Red / Small',
          option_value_1: 'Red',
          option_value_2: 'Small',
          image_storage_key: 'products/product-1/variant-1.jpg',
          rank: 1,
        },
      ],
      inventory: [
        {
          id: 'inventory-1',
          product_variant_id: 'variant-1',
          sku: 'SKU-1',
          stock: 5,
          price: 1200,
          sale_price: 1000,
        },
      ],
      shipping: {
        origin_country: 'VN',
        process_time_label: '1-2 days',
        destinations: [
          {
            id: 'destination-1',
            country_code: 'US',
            delivery_time_label: '5-7 days',
            service: 'Standard',
            charge_type: 'fixed',
            rank: 1,
          },
        ],
      },
    });
    expect(getPublicProductByIdUseCase.execute).toHaveBeenCalledWith('product-1');
  });

  it('throws not found when the product does not exist', async () => {
    getPublicProductByIdUseCase.execute.mockResolvedValue(null);

    await expect(controller.product('missing-product'))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
