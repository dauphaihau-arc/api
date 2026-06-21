import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/common/application/result';
import { appJobDeduplicationKey, appJobName } from '~/common/jobs/job.types';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import { JobDispatcher } from '~/modules/shared/queue/app/ports/job-dispatcher';
import { ProductVariantType } from '../../../domain/enums/product-variant-type.enum';
import {
  ActorCannotCreateProductDraftError,
  InvalidProductVariantConfigurationError,
  ProductNotFoundError,
} from '../../errors/product-app.error';
import { ProductCommandRepository } from '../../ports/product-command.repository';
import { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import type { ProductDraftSummary } from '../../product.types';

export interface SetProductVariantsInput {
  variants: Array<{
    optionValue1?: string;
    optionValue2?: string;
  }>;
}

type SetProductVariantsError =
  | ActorCannotCreateProductDraftError
  | InvalidProductVariantConfigurationError
  | ProductNotFoundError;

@Injectable()
export class SetProductVariantsUseCase {
  constructor(
    private readonly sellerProductQueryRepository: SellerProductQueryRepository,
    private readonly productCommandRepository: ProductCommandRepository,
    private readonly shopRepository: ShopRepository,
    private readonly jobDispatcher?: JobDispatcher,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    productId: string,
    input: SetProductVariantsInput,
  ): Promise<Result<ProductDraftSummary, SetProductVariantsError>> {
    const existingProduct = await this.sellerProductQueryRepository.findById(productId);

    if (!existingProduct) {
      return err(new ProductNotFoundError(productId));
    }

    const canManageAnyShop = actor.roles.includes('admin');

    if (!canManageAnyShop) {
      const ownedShop = await this.shopRepository.findOwnedById(
        existingProduct.shopId,
        actor.userId,
      );

      if (!ownedShop) {
        return err(new ActorCannotCreateProductDraftError());
      }
    }

    const validationError = validateVariantPayload(
      existingProduct.variantType ?? ProductVariantType.NONE,
      input.variants,
    );

    if (validationError) {
      return err(validationError);
    }

    const product = await this.productCommandRepository.replaceVariants({
      productId,
      variants: input.variants.map((variant, index) => ({
        name: buildVariantName(variant.optionValue1, variant.optionValue2),
        optionValue1: variant.optionValue1?.trim() || undefined,
        optionValue2: variant.optionValue2?.trim() || undefined,
        rank: index + 1,
      })),
    });

    if (!product) {
      return err(new ProductNotFoundError(productId));
    }

    await this.jobDispatcher?.dispatch(
      appJobName.projectCatalogProduct,
      { productId: product.id },
      {
        deduplicationKey: appJobDeduplicationKey.projectCatalogProduct(
          product.id,
        ),
      },
    );

    return ok(product);
  }
}

function validateVariantPayload(
  variantType: ProductVariantType,
  variants: SetProductVariantsInput['variants'],
): InvalidProductVariantConfigurationError | null {
  if (variantType === ProductVariantType.NONE) {
    return new InvalidProductVariantConfigurationError(
      'Products without variants cannot define variant rows',
    );
  }

  if (variants.length === 0) {
    return new InvalidProductVariantConfigurationError(
      'At least one variant is required',
    );
  }

  const seenNames = new Set<string>();

  for (const variant of variants) {
    const optionValue1 = variant.optionValue1?.trim();
    const optionValue2 = variant.optionValue2?.trim();

    if (!optionValue1) {
      return new InvalidProductVariantConfigurationError(
        'Each variant requires option value 1',
      );
    }

    if (
      variantType === ProductVariantType.SINGLE
      && optionValue2
    ) {
      return new InvalidProductVariantConfigurationError(
        'Single-variant products cannot define option value 2',
      );
    }

    if (
      variantType === ProductVariantType.COMBINE
      && !optionValue2
    ) {
      return new InvalidProductVariantConfigurationError(
        'Combined-variant products require option value 2',
      );
    }

    const name = buildVariantName(optionValue1, optionValue2);

    if (seenNames.has(name)) {
      return new InvalidProductVariantConfigurationError(
        `Duplicate variant "${name}" is not allowed`,
      );
    }

    seenNames.add(name);
  }

  return null;
}

function buildVariantName(optionValue1?: string, optionValue2?: string): string {
  return [optionValue1?.trim(), optionValue2?.trim()]
    .filter(Boolean)
    .join(' / ');
}
