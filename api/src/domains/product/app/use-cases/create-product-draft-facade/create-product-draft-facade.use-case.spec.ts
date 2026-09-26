import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import { ProductVariantLifecycleState } from '../../../domain/enums/product-variant-lifecycle-state.enum';
import { ShippingProfileStatus } from '~/domains/shipping/domain/enums/shipping-profile-status.enum';
import type { ProductAppError } from '../../errors/product-app.error';
import {
  InvalidProductVariantConfigurationError,
  ProductDraftIncompleteError,
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
    const configureProductVariantConfigurationUseCase = {
      execute: jest.fn().mockResolvedValue({
        isOk: true,
        value: {
          ...draft,
          variants: [
            {
              id: 'variant-1',
              rank: 1,
            },
          ],
        },
      }),
    };
    const assignProductShippingProfileUseCase = {
      execute: jest.fn().mockResolvedValue({
        isOk: true,
        value: {
          ...draft,
          shipping: {
            id: 'profile-1',
            name: 'Standard shipping',
            status: ShippingProfileStatus.ACTIVE,
            version: 1,
            currency: 'USD',
            shipFromCountry: 'US',
            shipFromPostal: '10001',
            checkoutReady: true,
            readinessIssues: [],
            rates: [],
          },
        },
      }),
    };

    const useCase = new CreateProductDraftFacadeUseCase(
      createProductDraftUseCase as never,
      setProductImagesByKeysUseCase as never,
      setProductAttributesUseCase as never,
      configureProductVariantConfigurationUseCase as never,
      assignProductShippingProfileUseCase as never,
    );

    return {
      useCase,
      createProductDraftUseCase,
      setProductImagesByKeysUseCase,
      setProductAttributesUseCase,
      configureProductVariantConfigurationUseCase,
      assignProductShippingProfileUseCase,
    };
  }

  it('creates a draft and orchestrates the follow-up product sections', async () => {
    const {
      useCase,
      setProductImagesByKeysUseCase,
      setProductAttributesUseCase,
      configureProductVariantConfigurationUseCase,
      assignProductShippingProfileUseCase,
    } = buildUseCase();

    const result = await useCase.execute(actor, {
      shopId: 'shop-1',
      categoryId: 'category-1',
      title: 'Handmade Mug',
      description: 'Wheel-thrown ceramic mug',
      whoMade: draft.whoMade,
      isDigital: false,
      nonTaxable: false,
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
          selections: [],
          lifecycleState: ProductVariantLifecycleState.ACTIVE,
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
      shippingProfileId: 'profile-1',
    });

    expect(result.isOk).toBe(true);
    expect(setProductImagesByKeysUseCase.execute).toHaveBeenCalledTimes(1);
    expect(setProductAttributesUseCase.execute).toHaveBeenCalledTimes(1);
    expect(configureProductVariantConfigurationUseCase.execute).toHaveBeenCalledTimes(1);
    expect(assignProductShippingProfileUseCase.execute).toHaveBeenCalledTimes(1);
  });

  it('returns an incomplete-draft error when inventory references an unknown variant client key', async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute(actor, {
      shopId: 'shop-1',
      title: 'Handmade Mug',
      description: 'Wheel-thrown ceramic mug',
      whoMade: draft.whoMade,
      variants: [
        {
          clientKey: 'black',
          selections: [],
          lifecycleState: ProductVariantLifecycleState.ACTIVE,
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
  });

  it('wraps downstream section failures as incomplete-draft errors', async () => {
    const { useCase, assignProductShippingProfileUseCase } = buildUseCase();
    assignProductShippingProfileUseCase.execute.mockResolvedValueOnce({
      isOk: false,
      error: new InvalidProductVariantConfigurationError('The selected shipping profile does not belong to this shop'),
    });

    const result = await useCase.execute(actor, {
      shopId: 'shop-1',
      title: 'Handmade Mug',
      description: 'Wheel-thrown ceramic mug',
      whoMade: draft.whoMade,
      shippingProfileId: 'profile-other-shop',
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
