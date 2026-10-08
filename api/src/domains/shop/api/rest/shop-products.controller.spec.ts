import { ok } from '~/platform/application/result';
import { ShopProductsController } from './shop-products.controller';

describe('ShopProductsController', () => {
  const shopAccessService = {
    resolveManageableShopByPublicId: jest.fn(),
    assertCanManageShop: jest.fn(),
  };
  const shopProductAccessService = { resolveManageableProduct: jest.fn() };
  const createProductDraftFacadeUseCase = { execute: jest.fn() };
  const createProductDraftUseCase = { execute: jest.fn() };
  const generateProductDescriptionUseCase = { execute: jest.fn() };
  const listShopProductsUseCase = { execute: jest.fn() };
  const publishProductUseCase = { execute: jest.fn() };
  const setProductImagesByKeysUseCase = { execute: jest.fn() };
  const setProductImagesUseCase = { execute: jest.fn() };
  const setProductAttributesUseCase = { execute: jest.fn() };
  const configureProductVariantConfigurationUseCase = { execute: jest.fn() };
  const assignProductShippingProfileUseCase = { execute: jest.fn() };

  const updateProductDetailsUseCase = { execute: jest.fn() };
  const bulkMutateShopProductsUseCase = { execute: jest.fn() };

  const controller = new ShopProductsController(
    shopAccessService as never,
    shopProductAccessService as never,
    createProductDraftFacadeUseCase as never,
    createProductDraftUseCase as never,
    generateProductDescriptionUseCase as never,
    listShopProductsUseCase as never,
    publishProductUseCase as never,
    setProductImagesByKeysUseCase as never,
    setProductImagesUseCase as never,
    setProductAttributesUseCase as never,
    configureProductVariantConfigurationUseCase as never,
    assignProductShippingProfileUseCase as never,
    updateProductDetailsUseCase as never,
    bulkMutateShopProductsUseCase as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    shopAccessService.resolveManageableShopByPublicId.mockResolvedValue({ id: 'shop-1' });
    shopProductAccessService.resolveManageableProduct.mockResolvedValue({
      id: 'product-1',
      publicId: 'public-product-1',
      shopId: 'shop-1',
      shopPublicId: 'public-shop-1',
    });
  });

  it('returns product detail in snake_case for the HTTP boundary', async () => {
    shopProductAccessService.resolveManageableProduct.mockResolvedValue({
      id: 'product-1',
      publicId: 'public-product-1',
      shopId: 'shop-1',
      shopPublicId: 'public-shop-1',
      categoryId: 'category-1',
      categoryName: 'Sneakers',
      title: 'Handmade Bag',
      slug: 'handmade-bag',
      description: 'A detail page payload.',
      state: 'draft',
      productVersion: 4,
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
      whoMade: 'i_did',
      isDigital: false,
      nonTaxable: true,
      tags: ['sneaker'],
      images: [
        {
          id: 'image-1',
          storageKey: 'products/image-1.jpg',
          url: 'https://cdn.example.test/products/image-1.jpg',
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
          imageStorageKey: 'products/variant-1.jpg',
          rank: 1,
          lifecycleState: 'active',
          removedAt: undefined,
          selections: [
            {
              optionId: 'option-color',
              valueId: 'value-brown',
            },
            {
              optionId: 'option-size',
              valueId: 'value-large',
            },
          ],
        },
      ],
      options: [
        {
          id: 'option-color',
          name: 'Color',
          position: 1,
          values: [{ id: 'value-brown', value: 'Brown', position: 1 }],
        },
        {
          id: 'option-size',
          name: 'Size',
          position: 2,
          values: [{ id: 'value-large', value: 'Large', position: 1 }],
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
        id: 'profile-1',
        name: 'Standard shipping',
        status: 'active',
        version: 2,
        shopCurrency: 'USD',
        shipFromCountry: 'US',
        shipFromPostal: '10001',
        checkoutReady: true,
        readinessIssues: [],
        rates: [
          {
            id: 'rate-1',
            position: 1,
            destinationScope: 'country',
            destinationCountry: 'US',
            oneItemFeeMinor: 599,
            additionalItemFeeMinor: 199,
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
      id: 'public-product-1',
      shop_id: 'public-shop-1',
      category_id: 'category-1',
      category: {
        id: 'category-1',
        name: 'Sneakers',
      },
      title: 'Handmade Bag',
      slug: 'handmade-bag',
      description: 'A detail page payload.',
      state: 'draft',
      product_version: 4,
      published_at: new Date('2026-01-01T00:00:00.000Z'),
      removed_at: undefined,
      who_made: 'i_did',
      is_digital: false,
      non_taxable: true,
      tags: ['sneaker'],
      images: [
        {
          id: 'image-1',
          url: 'https://cdn.example.test/products/image-1.jpg',
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
      options: [
        {
          id: 'option-color',
          name: 'Color',
          position: 1,
          values: [{ id: 'value-brown', value: 'Brown', position: 1 }],
        },
        {
          id: 'option-size',
          name: 'Size',
          position: 2,
          values: [{ id: 'value-large', value: 'Large', position: 1 }],
        },
      ],
      variants: [
        {
          id: 'variant-1',
          selections: [
            {
              option_id: 'option-color',
              value_id: 'value-brown',
            },
            {
              option_id: 'option-size',
              value_id: 'value-large',
            },
          ],
          image_url: undefined,
          rank: 1,
          lifecycle_state: 'active',
          removed_at: undefined,
        },
      ],
      inventory: [
        {
          id: 'inventory-1',
          product_variant_id: 'variant-1',
          sku: 'HB-001',
          stock: 5,
          on_hand_quantity: 5,
          reserved_quantity: 0,
          available_quantity: 5,
          on_hand_version: 1,
          shortage: 0,
          amount_minor: 2500,
          original_amount_minor: 3000,
          currency: 'USD',
        },
      ],
      shipping: {
        profile_id: 'profile-1',
        profile_name: 'Standard shipping',
        profile_status: 'active',
        profile_version: 2,
        currency: 'USD',
        ship_from_country: 'US',
        ship_from_postal: '10001',
        checkout_ready: true,
        readiness_issues: [],
        rates: [
          {
            id: 'rate-1',
            position: 1,
            destination_scope: 'country',
            destination_country: 'US',
            one_item_fee_minor: 599,
            additional_item_fee_minor: 199,
          },
        ],
      },
    });
    expect(shopProductAccessService.resolveManageableProduct).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      'shop-1',
      'product-1',
    );
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
      images: [],
      attributes: [],
      variants: [],
      inventory: [],
      options: [],
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
      id: 'public-product-1',
      shop_id: 'public-shop-1',
      category_id: 'category-1',
      who_made: 'i_did',
      is_digital: false,
      non_taxable: true,
      options: [],
    });
  });

  it('returns thumb_1x1 as the list image_url when available', async () => {
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
          images: [
            {
              id: 'image-1',
              storageKey: 'products/image-1/original.webp',
              url: 'https://cdn.example.test/products/image-1/original.webp',
              rank: 1,
              variantStatus: 'ready',
              variantError: undefined,
              variantsGeneratedAt: undefined,
              variants: [
                {
                  id: 'variant-thumb-1',
                  variant: 'thumb_1x1',
                  storageKey: 'products/image-1/thumb_1x1.webp',
                  url: 'https://cdn.example.test/products/image-1/thumb_1x1.webp',
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
          options: [],
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
          id: 'public-product-1',
          image_url: 'https://cdn.example.test/products/image-1/thumb_1x1.webp',
          images: [
            {
              id: 'image-1',
              image_url: 'https://cdn.example.test/products/image-1/thumb_1x1.webp',
              variants: [
                {
                  id: 'variant-thumb-1',
                  variant: 'thumb_1x1',
                  image_url: 'https://cdn.example.test/products/image-1/thumb_1x1.webp',
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
