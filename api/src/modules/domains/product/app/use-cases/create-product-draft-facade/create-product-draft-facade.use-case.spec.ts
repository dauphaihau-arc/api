import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';
import { ProductShippingCharge } from '../../../domain/enums/product-shipping-charge.enum';
import { ProductVariantType } from '../../../domain/enums/product-variant-type.enum';
import type { ProductAppError } from '../../errors/product-app.error';
import {
  InvalidProductVariantConfigurationError,
  ProductDraftIncompleteError
} from '../../errors/product-app.error';
import type { ProductDraftSummary } from '../../product.types';
import { CreateProductDraftFacadeUseCase } from './create-product-draft-facade.use-case';

describe('CreateProductDraftFacadeUseCase', () => {
  const actor: AuthenticatedUser = {
    userId: 'shop-owner-1',
    email: 'owner@example.com',
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    roles: [],
    permissions: [],
  };

  const draft: ProductDraftSummary = {
    id: 'product-1',
    shopId: 'shop-1',
    categoryId: 'category-1',
    title: 'Handmade Mug',
    slug: 'handmade-mug',
    description: 'Wheel-thrown ceramic mug',
    state: 'draft' as ProductDraftSummary['state'],
    whoMade: 'i_did' as ProductDraftSummary['whoMade'],
    isDigital: false,
    nonTaxable: false,
    variantType: ProductVariantType.SINGLE,
    variantGroupName: 'Color',
    images: [],
    attributes: [],
    variants: [],
    inventory: [],
  };

  function buildUseCase() {
    const createProductDraftUseCase = {
      execute: jest.fn().mockResolvedValue({
        isOk: true,
        value: draft,
      }),
    };
    const setProductImagesByKeysUseCase = {
      execute: jest.fn().mockResolvedValue({
        isOk: true,
        value: {
          ...draft,
          images: [
            {
              id: 'img-1',
              storageKey: 'products/tmp/1.jpg',
              url: 'http://localhost:9000/app-files/products/tmp/1.jpg',
              rank: 1,
            },
          ],
        },
      }),
    };
    const setProductAttributesUseCase = {
      execute: jest.fn().mockResolvedValue({
        isOk: true,
        value: {
          ...draft,
          attributes: [
            {
              id: 'attr-1',
              categoryAttributeId: 'cat-attr-1',
              categoryAttributeName: 'Material',
              inputType: 'text',
              selectedText: 'Ceramic',
            },
          ],
        },
      }),
    };
    const setProductVariantsUseCase = {
      execute: jest.fn().mockResolvedValue({
        isOk: true,
        value: {
          ...draft,
          variants: [
            {
              id: 'variant-1',
              name: 'Black',
              optionValue1: 'Black',
              rank: 1,
            },
          ],
        },
      }),
    };
    const setProductInventoryUseCase = {
      execute: jest.fn().mockResolvedValue({
        isOk: true,
        value: {
          ...draft,
          variants: [
            {
              id: 'variant-1',
              name: 'Black',
              optionValue1: 'Black',
              rank: 1,
            },
          ],
          inventory: [
            {
              id: 'inventory-1',
              productVariantId: 'variant-1',
              sku: 'MUG-BLK',
              stock: 5,
              amountMinor: 2450,
              currency: 'USD',
            },
          ],
        },
      }),
    };
    const setProductPricingUseCase = {
      execute: jest.fn().mockResolvedValue({
        isOk: true,
        value: {
          ...draft,
          variants: [
            {
              id: 'variant-1',
              name: 'Black',
              optionValue1: 'Black',
              rank: 1,
            },
          ],
          inventory: [
            {
              id: 'inventory-1',
              productVariantId: 'variant-1',
              sku: 'MUG-BLK',
              stock: 5,
              amountMinor: 2450,
              currency: 'USD',
            },
          ],
        },
      }),
    };
    const setProductShippingUseCase = {
      execute: jest.fn().mockResolvedValue({
        isOk: true,
        value: {
          ...draft,
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
                service: 'Standard',
                chargeType: ProductShippingCharge.FIXED_PRICE,
                rank: 1,
              },
            ],
          },
        },
      }),
    };

    const useCase = new CreateProductDraftFacadeUseCase(
      createProductDraftUseCase as never,
      setProductImagesByKeysUseCase as never,
      setProductAttributesUseCase as never,
      setProductVariantsUseCase as never,
      setProductInventoryUseCase as never,
      setProductPricingUseCase as never,
      setProductShippingUseCase as never
    );

    return {
      useCase,
      createProductDraftUseCase,
      setProductImagesByKeysUseCase,
      setProductAttributesUseCase,
      setProductVariantsUseCase,
      setProductInventoryUseCase,
      setProductPricingUseCase,
      setProductShippingUseCase,
    };
  }

  it('creates a draft and orchestrates the follow-up product sections', async () => {
    const {
      useCase,
      setProductImagesByKeysUseCase,
      setProductAttributesUseCase,
      setProductVariantsUseCase,
      setProductInventoryUseCase,
      setProductPricingUseCase,
      setProductShippingUseCase,
    } = buildUseCase();

    const result = await useCase.execute(actor, {
      shopId: 'shop-1',
      categoryId: 'category-1',
      title: 'Handmade Mug',
      description: 'Wheel-thrown ceramic mug',
      whoMade: draft.whoMade,
      isDigital: false,
      nonTaxable: false,
      variantType: ProductVariantType.SINGLE,
      variantGroupName: 'Color',
      images: [
        {
          storageKey: 'products/tmp/1.jpg',
          rank: 1,
        },
      ],
      attributes: [
        {
          categoryAttributeId: 'cat-attr-1',
          selectedText: 'Ceramic',
        },
      ],
      variants: [
        {
          clientKey: 'black',
          optionValue1: 'Black',
        },
      ],
      inventory: [
        {
          variantClientKey: 'black',
          sku: 'MUG-BLK',
          stock: 5,
        },
      ],
      pricing: [
        {
          variantClientKey: 'black',
          amountMinor: 2450,
          currency: 'USD',
        },
      ],
      shipping: {
        originCountry: 'US',
        originZip: '10001',
        processTimeLabel: '1-3 business days',
        destinations: [
          {
            countryCode: 'US',
            deliveryTimeLabel: '3-5 business days',
            service: 'Standard',
            chargeType: ProductShippingCharge.FIXED_PRICE,
          },
        ],
      },
    });

    expect(result.isOk).toBe(true);
    expect(setProductImagesByKeysUseCase.execute).toHaveBeenCalledTimes(1);
    expect(setProductAttributesUseCase.execute).toHaveBeenCalledTimes(1);
    expect(setProductVariantsUseCase.execute).toHaveBeenCalledTimes(1);
    expect(setProductShippingUseCase.execute).toHaveBeenCalledTimes(1);
    expect(setProductInventoryUseCase.execute).toHaveBeenCalledWith(
      actor,
      draft.id,
      {
        inventory: [
          {
            productVariantId: 'variant-1',
            sku: 'MUG-BLK',
            stock: 5,
          },
        ],
      }
    );
    expect(setProductPricingUseCase.execute).toHaveBeenCalledWith(
      actor,
      draft.id,
      {
        pricing: [
          {
            inventoryId: 'inventory-1',
            amountMinor: 2450,
            originalAmountMinor: undefined,
            currency: 'USD',
          },
        ],
      }
    );
  });

  it('returns an incomplete-draft error when inventory references an unknown variant client key', async () => {
    const { useCase, setProductInventoryUseCase } = buildUseCase();

    const result = await useCase.execute(actor, {
      shopId: 'shop-1',
      title: 'Handmade Mug',
      description: 'Wheel-thrown ceramic mug',
      whoMade: draft.whoMade,
      variantType: ProductVariantType.SINGLE,
      variantGroupName: 'Color',
      variants: [
        {
          clientKey: 'black',
          optionValue1: 'Black',
        },
      ],
      inventory: [
        {
          variantClientKey: 'white',
          stock: 5,
        },
      ],
    });

    expect(result.isOk).toBe(false);
    if (!result.isOk) {
      expect(result.error).toBeInstanceOf(ProductDraftIncompleteError);
      const error = result.error as ProductDraftIncompleteError;
      expect(error.failedStep).toBe('inventory');
      expect(error.message).toContain('unknown variant client key');
    }
    expect(setProductInventoryUseCase.execute).not.toHaveBeenCalled();
  });

  it('wraps downstream section failures as incomplete-draft errors', async () => {
    const { useCase, setProductShippingUseCase } = buildUseCase();
    setProductShippingUseCase.execute.mockResolvedValueOnce({
      isOk: false,
      error: new InvalidProductVariantConfigurationError('Origin zip is required'),
    });

    const result = await useCase.execute(actor, {
      shopId: 'shop-1',
      title: 'Handmade Mug',
      description: 'Wheel-thrown ceramic mug',
      whoMade: draft.whoMade,
      shipping: {
        originCountry: 'US',
        originZip: '',
        processTimeLabel: '1-3 business days',
        destinations: [
          {
            countryCode: 'US',
            deliveryTimeLabel: '3-5 business days',
            service: 'Standard',
            chargeType: ProductShippingCharge.FIXED_PRICE,
          },
        ],
      },
    });

    expect(result.isOk).toBe(false);
    if (!result.isOk) {
      expect(result.error).toBeInstanceOf(ProductDraftIncompleteError);
      const error = result.error as ProductAppError;
      expect(error).toMatchObject({
        failedStep: 'shipping',
        productId: draft.id,
      });
    }
  });
});
