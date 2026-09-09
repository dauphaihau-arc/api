import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/platform/application/result';
import { appJobDeduplicationKey } from '~/platform/jobs/app-job-deduplication';
import { appJobName } from '~/platform/jobs/app-job.names';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ShopRepository } from '~/domains/shop/app/ports/shop.repository';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { ProductVariantLifecycleState } from '../../../domain/enums/product-variant-lifecycle-state.enum';
import {
  ActorCannotCreateProductDraftError,
  InvalidProductVariantConfigurationError,
  ProductNotFoundError,
  ProductVersionConflictError,
  ProductConfigurationConflictError,
} from '../../errors/product-app.error';
import { ProductCommandRepository } from '../../ports/product-command.repository';
import { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import type { ConfigureProductVariantConfigurationRepositoryInput, ProductDraftSummary } from '../../product.types';

export type ConfigureProductVariantConfigurationInput = Omit<
  ConfigureProductVariantConfigurationRepositoryInput,
  'productId' | 'shopId' | 'expectedProductVersion' | 'commandId' | 'actorId'
> & {
  productVersion: number;
  idempotencyKey?: string;
  shopId?: string;
};

type ConfigureProductVariantConfigurationError =
  | ActorCannotCreateProductDraftError
  | InvalidProductVariantConfigurationError
  | ProductNotFoundError
  | ProductVersionConflictError
  | ProductConfigurationConflictError;

@Injectable()
export class ConfigureProductVariantConfigurationUseCase {
  constructor(
    private readonly sellerProductQueryRepository: SellerProductQueryRepository,
    private readonly productCommandRepository: ProductCommandRepository,
    private readonly shopRepository: ShopRepository,
    private readonly jobDispatcher?: JobDispatcher,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    productId: string,
    input: ConfigureProductVariantConfigurationInput,
  ): Promise<Result<ProductDraftSummary, ConfigureProductVariantConfigurationError>> {
    const targetProduct = await this.sellerProductQueryRepository.findMutationTargetById(productId);

    if (!targetProduct || (input.shopId && targetProduct.shopId !== input.shopId)) return err(new ProductNotFoundError(productId));

    const canManageAnyShop = actor.roles.includes('admin');
    if (!canManageAnyShop) {
      const ownedShop = await this.shopRepository.findOwnedById(targetProduct.shopId, actor.userId);
      if (!ownedShop) return err(new ActorCannotCreateProductDraftError());
    }

    if ((targetProduct.productVersion ?? 1) !== input.productVersion) {
      const currentProduct = await this.sellerProductQueryRepository.findById(productId);
      return currentProduct ? err(new ProductVersionConflictError(currentProduct)) : err(new ProductNotFoundError(productId));
    }

    const validationError = validateConfiguration(input);
    if (validationError) return err(validationError);

    let product: ProductDraftSummary | null;
    try {
      product = await this.productCommandRepository.configureVariantConfiguration({
        productId,
        shopId: targetProduct.shopId,
        expectedProductVersion: input.productVersion,
        commandId: input.idempotencyKey,
        actorId: actor.userId,
        options: input.options,
        variants: input.variants,
        removedVariantIds: input.removedVariantIds,
        restoreVariantIds: input.restoreVariantIds,
      });
    }
    catch (error) {
      if (error instanceof InvalidProductVariantConfigurationError || error instanceof ProductConfigurationConflictError) return err(error);
      throw error;
    }

    if (!product) {
      const currentProduct = await this.sellerProductQueryRepository.findById(productId);
      return currentProduct ? err(new ProductVersionConflictError(currentProduct)) : err(new ProductNotFoundError(productId));
    }

    await this.jobDispatcher?.dispatch(
      appJobName.projectCatalogProduct,
      { productId: product.id },
      {
        deduplicationKey: appJobDeduplicationKey.projectCatalogProduct(product.id),
        deduplicationMode: 'coalesce-latest',
      },
    );

    return ok(product);
  }
}

function validateConfiguration(input: ConfigureProductVariantConfigurationInput): InvalidProductVariantConfigurationError | null {
  if (input.options.length > 2) {
    return new InvalidProductVariantConfigurationError('Product Variant Configuration supports at most two options');
  }

  const optionIdentityKeys = new Set<string>();
  const optionRefs = new Set<string>();
  const valueRefs = new Set<string>();

  for (const option of input.options) {
    if (option.values.length === 0) return new InvalidProductVariantConfigurationError('Each option requires at least one value');
    if (Boolean(option.id) === Boolean(option.clientRef)) {
      return new InvalidProductVariantConfigurationError('Each option must provide exactly one id or client_ref');
    }
    const optionName = normalizeLabel(option.name);
    if (!optionName) return new InvalidProductVariantConfigurationError('Each option requires a name');
    if (optionIdentityKeys.has(optionName)) return new InvalidProductVariantConfigurationError(`Duplicate option "${option.name}" is not allowed`);
    optionIdentityKeys.add(optionName);

    if (option.clientRef) {
      if (optionRefs.has(option.clientRef) || valueRefs.has(option.clientRef)) return new InvalidProductVariantConfigurationError(`Duplicate client_ref "${option.clientRef}" is not allowed`);
      optionRefs.add(option.clientRef);
    }

    const valueNames = new Set<string>();
    for (const value of option.values) {
      if (Boolean(value.id) === Boolean(value.clientRef)) {
        return new InvalidProductVariantConfigurationError('Each option value must provide exactly one id or client_ref');
      }
      const valueName = normalizeLabel(value.value);
      if (!valueName) return new InvalidProductVariantConfigurationError('Each option value requires a value');
      if (valueNames.has(valueName)) return new InvalidProductVariantConfigurationError(`Duplicate value "${value.value}" is not allowed`);
      valueNames.add(valueName);

      if (value.clientRef) {
        if (valueRefs.has(value.clientRef) || optionRefs.has(value.clientRef)) return new InvalidProductVariantConfigurationError(`Duplicate client_ref "${value.clientRef}" is not allowed`);
        valueRefs.add(value.clientRef);
      }
    }
  }

  const matrixSize = input.options.reduce((size, option) => size * option.values.length, 1);
  if (input.variants.length !== matrixSize) {
    return new InvalidProductVariantConfigurationError('Product Variant Configuration must provide the complete option matrix');
  }

  const seenCombinations = new Set<string>();

  for (const variant of input.variants) {
    if (variant.clientRef) {
      if (optionRefs.has(variant.clientRef) || valueRefs.has(variant.clientRef)) return new InvalidProductVariantConfigurationError('client_ref must be request-wide unique');
      valueRefs.add(variant.clientRef);
    }
    if (Boolean(variant.id) === Boolean(variant.clientRef)) {
      return new InvalidProductVariantConfigurationError('Each variant must provide exactly one id or client_ref');
    }
    if (variant.lifecycleState !== ProductVariantLifecycleState.ACTIVE && variant.lifecycleState !== ProductVariantLifecycleState.INACTIVE) {
      return new InvalidProductVariantConfigurationError('Variant lifecycle_state must be active or inactive');
    }
    if (variant.selections.length !== input.options.length) {
      return new InvalidProductVariantConfigurationError('Each variant selection count must match option count');
    }

    const selectionKeys: string[] = [];
    for (const selection of variant.selections) {
      if (Boolean(selection.optionId) === Boolean(selection.optionRef)) {
        return new InvalidProductVariantConfigurationError('Each selection must provide exactly one option_id or option_ref');
      }
      if (Boolean(selection.valueId) === Boolean(selection.valueRef)) {
        return new InvalidProductVariantConfigurationError('Each selection must provide exactly one value_id or value_ref');
      }
      selectionKeys.push(`${selection.optionId ?? selection.optionRef}:${selection.valueId ?? selection.valueRef}`);
    }
    selectionKeys.sort();

    const combinationKey = selectionKeys.join('|');
    if (seenCombinations.has(combinationKey)) {
      return new InvalidProductVariantConfigurationError('Duplicate variant option selections are not allowed');
    }
    seenCombinations.add(combinationKey);

    if (!variant.id) {
      if (variant.inventory?.onHandQuantity === undefined || variant.inventory.amountMinor === undefined || !variant.inventory.currency) {
        return new InvalidProductVariantConfigurationError('New variants require reviewed inventory on_hand_quantity, amount_minor and currency');
      }
    }
  }

  return null;
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
