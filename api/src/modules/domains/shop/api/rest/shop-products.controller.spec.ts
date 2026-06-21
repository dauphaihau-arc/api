import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ok } from '~/common/application/result';
import { ShopProductsController } from './shop-products.controller';

describe('ShopProductsController', () => {
  const shopRepository = {
    findByActorUserId: jest.fn(),
    findOwnedById: jest.fn(),
    findById: jest.fn(),
  };
  const createProductDraftFacadeUseCase = { execute: jest.fn() };
  const createProductDraftUseCase = { execute: jest.fn() };
  const getProductByIdUseCase = { execute: jest.fn() };
  const generateProductDescriptionUseCase = { execute: jest.fn() };
  const listShopProductsUseCase = { execute: jest.fn() };
  const publishProductUseCase = { execute: jest.fn() };
  const setProductImagesByKeysUseCase = { execute: jest.fn() };
  const setProductImagesUseCase = { execute: jest.fn() };
  const setProductAttributesUseCase = { execute: jest.fn() };
  const setProductVariantsUseCase = { execute: jest.fn() };
  const setProductInventoryUseCase = { execute: jest.fn() };
  const setProductPricingUseCase = { execute: jest.fn() };
  const setProductShippingUseCase = { execute: jest.fn() };
  const updateProductDetailsUseCase = { execute: jest.fn() };
  const bulkMutateShopProductsUseCase = { execute: jest.fn() };

  const controller = new ShopProductsController(
    shopRepository as never,
    createProductDraftFacadeUseCase as never,
    createProductDraftUseCase as never,
    getProductByIdUseCase as never,
    generateProductDescriptionUseCase as never,
    listShopProductsUseCase as never,
    publishProductUseCase as never,
    setProductImagesByKeysUseCase as never,
    setProductImagesUseCase as never,
    setProductAttributesUseCase as never,
    setProductVariantsUseCase as never,
    setProductInventoryUseCase as never,
    setProductPricingUseCase as never,
    setProductShippingUseCase as never,
    updateProductDetailsUseCase as never,
    bulkMutateShopProductsUseCase as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    shopRepository.findOwnedById.mockResolvedValue({
      id: 'shop-1',
    });
  });

  it('registers GET :id on the controller method', () => {
    const handler = ShopProductsController.prototype.product;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':id');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });

  it('returns product detail in snake_case for the HTTP boundary', async () => {
    getProductByIdUseCase.execute.mockResolvedValue({
      id: 'product-1',
      publicId: 'public-product-1',
      shopId: 'shop-1',
      shopPublicId: 'public-shop-1',
      categoryId: 'category-1',
      title: 'Handmade Bag',
      slug: 'handmade-bag',
      description: 'A detail page payload.',
      state: 'draft',
      whoMade: 'i_did',
      isDigital: false,
      nonTaxable: true,
      variantType: 'single',
      variantGroupName: 'Color',
      variantSubGroupName: 'Size',
      images: [
        {
          id: 'image-1',
          storageKey: 'products/image-1.jpg',
          rank: 1,
          variantStatus: 'ready',
          variantError: undefined,
          variantsGeneratedAt: undefined,
          variants: undefined,
        },
      ],
      attributes: [
        {
          id: 'attribute-value-1',
          categoryAttributeId: 'attribute-1',
          categoryAttributeName: 'Material',
          inputType: 'select',
          selectedOptionId: 'option-1',
          selectedOptionValue: 'Leather',
          selectedText: undefined,
        },
      ],
      variants: [
        {
          id: 'variant-1',
          name: 'Brown / Large',
          optionValue1: 'Brown',
          optionValue2: 'Large',
          imageStorageKey: 'products/variant-1.jpg',
          rank: 1,
        },
      ],
      inventory: [
        {
          id: 'inventory-1',
          productVariantId: 'variant-1',
          sku: 'HB-001',
          stock: 5,
          amountMinor: 2500,
          originalAmountMinor: 3000,
          currency: 'USD',
        },
      ],
      shipping: {
        id: 'shipping-1',
        originCountry: 'US',
        originZip: '10001',
        processTimeLabel: '1-3 business days',
        destinations: [
          {
            id: 'destination-1',
            countryCode: 'US',
            deliveryTimeLabel: '3-5 business days',
            service: 'standard',
            chargeType: 'free_shipping',
            rank: 1,
          },
        ],
      },
    });

    await expect(controller.product('shop-1', 'product-1', {
      userId: 'user-1',
      email: 'seller@example.com',
      status: 'active',
      sessionId: 'session-1',
      roles: [],
      permissions: [],
    } as never)).resolves.toEqual({
      id: 'product-1',
      public_id: 'public-product-1',
      shop_id: 'shop-1',
      shop_public_id: 'public-shop-1',
      category_id: 'category-1',
      title: 'Handmade Bag',
      slug: 'handmade-bag',
      description: 'A detail page payload.',
      state: 'draft',
      who_made: 'i_did',
      is_digital: false,
      non_taxable: true,
      variant_type: 'single',
      variant_group_name: 'Color',
      variant_sub_group_name: 'Size',
      images: [
        {
          id: 'image-1',
          storage_key: 'products/image-1.jpg',
          rank: 1,
          variant_status: 'ready',
          variant_error: undefined,
          variants_generated_at: undefined,
          variants: undefined,
        },
      ],
      attributes: [
        {
          id: 'attribute-value-1',
          category_attribute_id: 'attribute-1',
          category_attribute_name: 'Material',
          input_type: 'select',
          selected_option_id: 'option-1',
          selected_option_value: 'Leather',
          selected_text: undefined,
        },
      ],
      variants: [
        {
          id: 'variant-1',
          name: 'Brown / Large',
          option_value_1: 'Brown',
          option_value_2: 'Large',
          image_storage_key: 'products/variant-1.jpg',
          rank: 1,
        },
      ],
      inventory: [
        {
          id: 'inventory-1',
          product_variant_id: 'variant-1',
          sku: 'HB-001',
          stock: 5,
          amount_minor: 2500,
          original_amount_minor: 3000,
          currency: 'USD',
        },
      ],
      shipping: {
        id: 'shipping-1',
        origin_country: 'US',
        origin_zip: '10001',
        process_time_label: '1-3 business days',
        destinations: [
          {
            id: 'destination-1',
            country_code: 'US',
            delivery_time_label: '3-5 business days',
            service: 'standard',
            charge_type: 'free_shipping',
            rank: 1,
          },
        ],
      },
    });
    expect(getProductByIdUseCase.execute).toHaveBeenCalledWith('product-1');
  });

  it('returns created product drafts in snake_case for the HTTP boundary', async () => {
    createProductDraftUseCase.execute.mockResolvedValue(ok({
      id: 'product-1',
      publicId: 'public-product-1',
      shopId: 'shop-1',
      shopPublicId: 'public-shop-1',
      categoryId: 'category-1',
      title: 'Handmade Bag',
      slug: 'handmade-bag',
      description: 'A detail page payload.',
      state: 'draft',
      whoMade: 'i_did',
      isDigital: false,
      nonTaxable: true,
      variantType: 'single',
      variantGroupName: 'Color',
      variantSubGroupName: 'Size',
      images: [],
      attributes: [],
      variants: [],
      inventory: [],
      shipping: undefined,
    }));

    await expect(controller.createProductDraft(
      'shop-1',
      {
        userId: 'user-1',
        email: 'seller@example.com',
        status: 'active',
        sessionId: 'session-1',
        roles: [],
        permissions: [],
      } as never,
      {
        title: 'Handmade Bag',
        description: 'A detail page payload.',
        whoMade: 'i_did',
      } as never,
    )).resolves.toMatchObject({
      id: 'product-1',
      public_id: 'public-product-1',
      shop_id: 'shop-1',
      shop_public_id: 'public-shop-1',
      category_id: 'category-1',
      who_made: 'i_did',
      is_digital: false,
      non_taxable: true,
      variant_type: 'single',
      variant_group_name: 'Color',
      variant_sub_group_name: 'Size',
    });
  });

  it('returns thumb_1x1 as the list image storage_key when available', async () => {
    listShopProductsUseCase.execute.mockResolvedValue({
      items: [
        {
          id: 'product-1',
          publicId: 'public-product-1',
          shopId: 'shop-1',
          shopPublicId: 'public-shop-1',
          categoryId: 'category-1',
          title: 'Handmade Bag',
          slug: 'handmade-bag',
          description: 'A list payload.',
          state: 'draft',
          whoMade: 'i_did',
          isDigital: false,
          nonTaxable: true,
          variantType: 'single',
          variantGroupName: 'Color',
          variantSubGroupName: 'Size',
          images: [
            {
              id: 'image-1',
              storageKey: 'products/image-1/original.webp',
              rank: 1,
              variantStatus: 'ready',
              variantError: undefined,
              variantsGeneratedAt: undefined,
              variants: [
                {
                  id: 'variant-thumb-1',
                  variant: 'thumb_1x1',
                  storageKey: 'products/image-1/thumb_1x1.webp',
                  width: 200,
                  height: 200,
                  format: 'webp',
                },
              ],
            },
          ],
          attributes: [],
          variants: [],
          inventory: [],
        },
      ],
      meta: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    await expect(controller.products(
      'shop-1',
      { page: 1, limit: 20 } as never,
      {
        userId: 'user-1',
        email: 'seller@example.com',
        status: 'active',
        sessionId: 'session-1',
        roles: [],
        permissions: [],
      } as never,
    )).resolves.toMatchObject({
      items: [
        {
          id: 'product-1',
          images: [
            {
              id: 'image-1',
              storage_key: 'products/image-1/thumb_1x1.webp',
              variants: [
                {
                  id: 'variant-thumb-1',
                  variant: 'thumb_1x1',
                  storage_key: 'products/image-1/thumb_1x1.webp',
                },
              ],
            },
          ],
        },
      ],
      meta: {
        page: 1,
        limit: 20,
        total: 1,
        total_pages: 1,
        has_next_page: false,
        has_previous_page: false,
      },
    });
  });
});
