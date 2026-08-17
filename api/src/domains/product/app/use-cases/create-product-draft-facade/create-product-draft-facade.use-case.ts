import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/platform/application/result';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ProductShippingCharge } from '../../../domain/enums/product-shipping-charge.enum';
import { ProductVariantType } from '../../../domain/enums/product-variant-type.enum';
import {
  ActorCannotCreateProductDraftError,
  CategoryNotFoundError,
  InvalidProductAttributeSelectionError,
  InvalidProductVariantConfigurationError,
  ProductDraftIncompleteError,
  ProductNotFoundError,
} from '../../errors/product-app.error';
import type { ProductDraftSummary } from '../../product.types';
import {
  CreateProductDraftUseCase,
  type CreateProductDraftInput,
} from '../create-product-draft/create-product-draft.use-case';
import { SetProductAttributesUseCase } from '../set-product-attributes/set-product-attributes.use-case';
import { SetProductImagesByKeysUseCase } from '../set-product-images-by-keys/set-product-images-by-keys.use-case';
import { SetProductInventoryUseCase } from '../set-product-inventory/set-product-inventory.use-case';
import { SetProductPricingUseCase } from '../set-product-pricing/set-product-pricing.use-case';
import { SetProductShippingUseCase } from '../set-product-shipping/set-product-shipping.use-case';
import { SetProductVariantsUseCase } from '../set-product-variants/set-product-variants.use-case';

export interface CreateProductDraftFacadeInput
  extends Omit<CreateProductDraftInput, 'shopId'> {
  shopId: string;
  images?: Array<{
    storageKey: string;
    rank: number;
  }>;
  attributes?: Array<{
    categoryAttributeId: string;
    selectedOptionId?: string;
    selectedText?: string;
  }>;
  variants?: Array<{
    clientKey: string;
    optionValue1: string;
    optionValue2?: string;
  }>;
  inventory?: Array<{
    variantClientKey?: string;
    sku?: string;
    stock: number;
  }>;
  pricing?: Array<{
    variantClientKey?: string;
    amountMinor: number;
    originalAmountMinor?: number;
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
  | ProductNotFoundError;

@Injectable()
export class CreateProductDraftFacadeUseCase {
  constructor(
    private readonly createProductDraftUseCase: CreateProductDraftUseCase,
    private readonly setProductImagesByKeysUseCase: SetProductImagesByKeysUseCase,
    private readonly setProductAttributesUseCase: SetProductAttributesUseCase,
    private readonly setProductVariantsUseCase: SetProductVariantsUseCase,
    private readonly setProductInventoryUseCase: SetProductInventoryUseCase,
    private readonly setProductPricingUseCase: SetProductPricingUseCase,
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
      variantType: input.variantType,
      variantGroupName: input.variantGroupName,
      variantSubGroupName: input.variantSubGroupName,
    });

    if (!createdDraft.isOk) {
      return createdDraft;
    }

    let currentProduct = createdDraft.value;

    if (input.images?.length) {
      const imagesResult = await this.setProductImagesByKeysUseCase.execute(
        actor,
        currentProduct.id,
        {
          images: input.images,
        },
      );

      if (!imagesResult.isOk) {
        return this.incomplete(currentProduct.id, 'images', imagesResult.error);
      }

      currentProduct = imagesResult.value;
    }

    if (input.attributes?.length) {
      const attributesResult = await this.setProductAttributesUseCase.execute(
        actor,
        currentProduct.id,
        {
          attributes: input.attributes,
        },
      );

      if (!attributesResult.isOk) {
        return this.incomplete(
          currentProduct.id,
          'attributes',
          attributesResult.error,
        );
      }

      currentProduct = attributesResult.value;
    }

    let variantIdByClientKey = new Map<string, string>();

    if (input.variants?.length) {
      const variantsResult = await this.setProductVariantsUseCase.execute(
        actor,
        currentProduct.id,
        {
          variants: input.variants.map((variant) => ({
            optionValue1: variant.optionValue1,
            optionValue2: variant.optionValue2,
          })),
        },
      );

      if (!variantsResult.isOk) {
        return this.incomplete(currentProduct.id, 'variants', variantsResult.error);
      }

      currentProduct = variantsResult.value;
      variantIdByClientKey = buildVariantIdByClientKey(
        input.variants,
        currentProduct,
      );
    }

    if (input.inventory?.length) {
      const missingVariantClientKey = findMissingVariantClientKey(
        input.variantType ?? ProductVariantType.NONE,
        input.inventory,
        variantIdByClientKey,
      );

      if (missingVariantClientKey) {
        return err(
          new ProductDraftIncompleteError(
            currentProduct.id,
            'inventory',
            `Inventory row references unknown variant client key "${missingVariantClientKey}"`,
          ),
        );
      }

      const inventoryResult = await this.setProductInventoryUseCase.execute(
        actor,
        currentProduct.id,
        {
          inventory: input.inventory.map((row) => ({
            productVariantId: row.variantClientKey
              ? variantIdByClientKey.get(row.variantClientKey)
              : undefined,
            sku: row.sku,
            stock: row.stock,
          })),
        },
      );

      if (!inventoryResult.isOk) {
        return this.incomplete(
          currentProduct.id,
          'inventory',
          inventoryResult.error,
        );
      }

      currentProduct = inventoryResult.value;
    }

    if (input.pricing?.length) {
      const inventoryIdByVariantClientKey = buildInventoryIdByClientKey(
        input.variantType ?? ProductVariantType.NONE,
        input.variants,
        currentProduct,
      );
      const missingVariantClientKey = findMissingPricingVariantClientKey(
        input.variantType ?? ProductVariantType.NONE,
        input.pricing,
        inventoryIdByVariantClientKey,
      );

      if (missingVariantClientKey) {
        return err(
          new ProductDraftIncompleteError(
            currentProduct.id,
            'inventory',
            `Pricing row references unknown variant client key "${missingVariantClientKey}"`,
          ),
        );
      }

      const pricingResult = await this.setProductPricingUseCase.execute(
        actor,
        currentProduct.id,
        {
          pricing: input.pricing.map((row) => ({
            inventoryId: row.variantClientKey
              ? inventoryIdByVariantClientKey.get(row.variantClientKey) ?? ''
              : inventoryIdByVariantClientKey.get('__no_variant__') ?? '',
            amountMinor: row.amountMinor,
            originalAmountMinor: row.originalAmountMinor,
            currency: row.currency,
          })),
        },
      );

      if (!pricingResult.isOk) {
        return this.incomplete(
          currentProduct.id,
          'inventory',
          pricingResult.error,
        );
      }

      currentProduct = pricingResult.value;
    }

    if (input.shipping) {
      const shippingResult = await this.setProductShippingUseCase.execute(
        actor,
        currentProduct.id,
        input.shipping,
      );

      if (!shippingResult.isOk) {
        return this.incomplete(currentProduct.id, 'shipping', shippingResult.error);
      }

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

function buildVariantIdByClientKey(
  requestedVariants: NonNullable<CreateProductDraftFacadeInput['variants']>,
  product: ProductDraftSummary,
): Map<string, string> {
  const productVariantIdByName = new Map(
    product.variants.map((variant) => [
      buildVariantName(variant.optionValue1, variant.optionValue2),
      variant.id,
    ]),
  );

  return new Map(
    requestedVariants.map((variant) => [
      variant.clientKey,
      productVariantIdByName.get(
        buildVariantName(variant.optionValue1, variant.optionValue2),
      ) ?? '',
    ]),
  );
}

function findMissingVariantClientKey(
  variantType: ProductVariantType,
  inventory: NonNullable<CreateProductDraftFacadeInput['inventory']>,
  variantIdByClientKey: Map<string, string>,
): string | null {
  if (variantType === ProductVariantType.NONE) {
    return null;
  }

  for (const row of inventory) {
    if (!row.variantClientKey) {
      return '(missing)';
    }

    if (!variantIdByClientKey.get(row.variantClientKey)) {
      return row.variantClientKey;
    }
  }

  return null;
}

function buildInventoryIdByClientKey(
  variantType: ProductVariantType,
  requestedVariants: CreateProductDraftFacadeInput['variants'],
  product: ProductDraftSummary,
): Map<string, string> {
  if (variantType === ProductVariantType.NONE) {
    return new Map([
      ['__no_variant__', product.inventory[0]?.id ?? ''],
    ]);
  }

  const inventoryIdByVariantId = new Map(
    product.inventory
      .filter((inventory) => inventory.productVariantId)
      .map((inventory) => [inventory.productVariantId as string, inventory.id]),
  );
  const variantIdByClientKey = requestedVariants
    ? buildVariantIdByClientKey(requestedVariants, product)
    : new Map<string, string>();

  return new Map(
    Array.from(variantIdByClientKey.entries()).map(([clientKey, variantId]) => [
      clientKey,
      inventoryIdByVariantId.get(variantId) ?? '',
    ]),
  );
}

function findMissingPricingVariantClientKey(
  variantType: ProductVariantType,
  pricing: NonNullable<CreateProductDraftFacadeInput['pricing']>,
  inventoryIdByVariantClientKey: Map<string, string>,
): string | null {
  if (variantType === ProductVariantType.NONE) {
    return inventoryIdByVariantClientKey.get('__no_variant__') ? null : '(missing)';
  }

  for (const row of pricing) {
    if (!row.variantClientKey) {
      return '(missing)';
    }

    if (!inventoryIdByVariantClientKey.get(row.variantClientKey)) {
      return row.variantClientKey;
    }
  }

  return null;
}

function buildVariantName(optionValue1?: string, optionValue2?: string): string {
  return [optionValue1?.trim(), optionValue2?.trim()]
    .filter(Boolean)
    .join(' / ');
}
