import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/platform/application/result';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ProductShippingCharge } from '../../../domain/enums/product-shipping-charge.enum';
import { ProductVariantLifecycleState } from '../../../domain/enums/product-variant-lifecycle-state.enum';
import {
  ActorCannotCreateProductDraftError,
  CategoryNotFoundError,
  InvalidProductAttributeSelectionError,
  InvalidProductVariantConfigurationError,
  ProductDraftIncompleteError,
  ProductNotFoundError,
  ProductVersionConflictError,
} from '../../errors/product-app.error';
import type { ProductDraftSummary } from '../../product.types';
import {
  CreateProductDraftUseCase,
  type CreateProductDraftInput,
} from '../create-product-draft/create-product-draft.use-case';
import { ConfigureProductVariantConfigurationUseCase } from '../configure-product-variant-configuration/configure-product-variant-configuration.use-case';
import { SetProductAttributesUseCase } from '../set-product-attributes/set-product-attributes.use-case';
import { SetProductImagesByKeysUseCase } from '../set-product-images-by-keys/set-product-images-by-keys.use-case';
import { SetProductShippingUseCase } from '../set-product-shipping/set-product-shipping.use-case';

export interface CreateProductDraftFacadeInput extends Omit<CreateProductDraftInput, 'shopId'> {
  shopId: string;
  images?: Array<{
    storageKey: string;
    rank: number;
  }>;
  attributes?: Array<{
    categoryAttributeId: string;
    selectedText?: string;
  }>;
  options?: Array<{
    clientRef?: string;
    name: string;
    position: number;
    values: Array<{
      clientRef?: string;
      value: string;
      position: number;
    }>;
  }>;
  variants?: Array<{
    id?: string;
    clientRef?: string;
    clientKey?: string;
    selections: Array<{
      optionId?: string;
      optionRef?: string;
      valueId?: string;
      valueRef?: string;
    }>;
    lifecycleState: ProductVariantLifecycleState;
    inventory?: {
      sku?: string | null;
      onHandQuantity?: number;
      expectedOnHandVersion?: number;
      amountMinor?: number;
      currency?: string;
    };
  }>;
  inventory?: Array<{
    variantClientKey?: string;
    variantId?: string;
    sku?: string | null;
    stock?: number;
    onHandQuantity?: number;
    expectedOnHandVersion?: number;
  }>;
  pricing?: Array<{
    variantClientKey?: string;
    variantId?: string;
    amountMinor: number;
    currency?: string;
  }>;
  shipping?: {
    originCountry: string;
    originZip: string;
    processTimeLabel: string;
    destinations: Array<{
      countryCode: string;
      deliveryTimeLabel: string;
      service: string;
      chargeType: ProductShippingCharge;
    }>;
  };
}

type CreateProductDraftFacadeError =
  | ActorCannotCreateProductDraftError
  | CategoryNotFoundError
  | InvalidProductAttributeSelectionError
  | InvalidProductVariantConfigurationError
  | ProductDraftIncompleteError
  | ProductNotFoundError
  | ProductVersionConflictError;

@Injectable()
export class CreateProductDraftFacadeUseCase {
  constructor(
    private readonly createProductDraftUseCase: CreateProductDraftUseCase,
    private readonly setProductImagesByKeysUseCase: SetProductImagesByKeysUseCase,
    private readonly setProductAttributesUseCase: SetProductAttributesUseCase,
    private readonly configureProductVariantConfigurationUseCase: ConfigureProductVariantConfigurationUseCase,
    private readonly setProductShippingUseCase: SetProductShippingUseCase,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    input: CreateProductDraftFacadeInput,
  ): Promise<Result<ProductDraftSummary, CreateProductDraftFacadeError>> {
    const createdDraft = await this.createProductDraftUseCase.execute(actor, {
      shopId: input.shopId,
      categoryId: input.categoryId,
      title: input.title,
      description: input.description,
      whoMade: input.whoMade,
      isDigital: input.isDigital,
      nonTaxable: input.nonTaxable,
      tags: input.tags,
    });

    if (!createdDraft.isOk) return createdDraft;

    let currentProduct = createdDraft.value;

    if (input.images?.length) {
      const imagesResult = await this.setProductImagesByKeysUseCase.execute(actor, currentProduct.id, {
        images: input.images,
      });
      if (!imagesResult.isOk) return this.incomplete(currentProduct.id, 'images', imagesResult.error);
      currentProduct = imagesResult.value;
    }

    if (input.attributes?.length) {
      const attributesResult = await this.setProductAttributesUseCase.execute(actor, currentProduct.id, {
        attributes: input.attributes,
      });
      if (!attributesResult.isOk) return this.incomplete(currentProduct.id, 'attributes', attributesResult.error);
      currentProduct = attributesResult.value;
    }

    const requestedOptions = input.options ?? [];
    const requestedVariants = input.variants ?? [{
      clientRef: 'default',
      selections: [],
      lifecycleState: ProductVariantLifecycleState.ACTIVE,
      inventory: {
        onHandQuantity: 0,
        amountMinor: 0,
        currency: 'USD',
      },
    }];
    const requestedVariantKeys = new Set(
      requestedVariants.map((variant) => variant.id ?? variant.clientRef ?? variant.clientKey ?? 'default'),
    );
    const unknownInventoryKey = input.inventory?.find((inventory) => {
      const key = inventory.variantId ?? inventory.variantClientKey ?? 'default';
      return !requestedVariantKeys.has(key);
    });
    if (unknownInventoryKey) {
      return this.incomplete(
        currentProduct.id,
        'inventory',
        new ProductDraftIncompleteError(currentProduct.id, 'inventory', 'unknown variant client key'),
      );
    }
    const unknownPricingKey = input.pricing?.find((pricing) => {
      const key = pricing.variantId ?? pricing.variantClientKey ?? 'default';
      return !requestedVariantKeys.has(key);
    });
    if (unknownPricingKey) {
      return this.incomplete(
        currentProduct.id,
        'inventory',
        new ProductDraftIncompleteError(currentProduct.id, 'inventory', 'unknown pricing variant client key'),
      );
    }

    const inventoryByVariantKey = new Map((input.inventory ?? []).map((inventory) => [inventory.variantId ?? inventory.variantClientKey ?? 'default', inventory]));
    const pricingByVariantKey = new Map((input.pricing ?? []).map((pricing) => [pricing.variantId ?? pricing.variantClientKey ?? 'default', pricing]));
    const existingDefaultVariant = currentProduct.variants.find((variant) => variant.selections.length === 0);
    const existingDefaultInventory = currentProduct.inventory.find((inventory) => inventory.productVariantId === existingDefaultVariant?.id);
    const configurationVariants = requestedVariants.map((variant) => {
      const key = variant.id ?? variant.clientRef ?? variant.clientKey ?? 'default';
      const inventory = inventoryByVariantKey.get(key);
      const pricing = pricingByVariantKey.get(key);

      const shouldReuseDefaultVariant = requestedOptions.length === 0
        && key === 'default'
        && variant.selections.length === 0
        && Boolean(existingDefaultVariant);
      return {
        id: variant.id ?? (shouldReuseDefaultVariant ? existingDefaultVariant?.id : undefined),
        clientRef: variant.id || shouldReuseDefaultVariant ? undefined : variant.clientRef ?? variant.clientKey,
        selections: variant.selections,
        lifecycleState: variant.lifecycleState,
        inventory: {
          sku: variant.inventory?.sku ?? inventory?.sku,
          onHandQuantity: variant.inventory?.onHandQuantity ?? inventory?.onHandQuantity ?? inventory?.stock,
          expectedOnHandVersion: variant.inventory?.expectedOnHandVersion ?? inventory?.expectedOnHandVersion ??
            (shouldReuseDefaultVariant ? existingDefaultInventory?.onHandVersion : undefined),
          amountMinor: variant.inventory?.amountMinor ?? pricing?.amountMinor,
          currency: variant.inventory?.currency ?? pricing?.currency,
        },
      };
    });

    const retainedVariantIds = new Set(configurationVariants.map((variant) => variant.id).filter((id): id is string => Boolean(id)));
    const removedVariantIds = currentProduct.variants
      .filter((variant) => !retainedVariantIds.has(variant.id))
      .map((variant) => variant.id);

    const configurationResult = await this.configureProductVariantConfigurationUseCase.execute(actor, currentProduct.id, {
      productVersion: currentProduct.productVersion ?? 1,
      shopId: input.shopId,
      options: requestedOptions,
      variants: configurationVariants,
      removedVariantIds,
      restoreVariantIds: [],
    });
    if (!configurationResult.isOk) return this.incomplete(currentProduct.id, 'variants', configurationResult.error);
    currentProduct = configurationResult.value;
    

    if (input.shipping) {
      const shippingResult = await this.setProductShippingUseCase.execute(actor, currentProduct.id, input.shipping);
      if (!shippingResult.isOk) return this.incomplete(currentProduct.id, 'shipping', shippingResult.error);
      currentProduct = shippingResult.value;
    }

    return ok(currentProduct);
  }

  private incomplete(
    productId: string,
    failedStep: ProductDraftIncompleteError['failedStep'],
    error: Exclude<CreateProductDraftFacadeError, ProductDraftIncompleteError>,
  ): Result<ProductDraftSummary, ProductDraftIncompleteError> {
    return err(new ProductDraftIncompleteError(productId, failedStep, error.message));
  }
}
