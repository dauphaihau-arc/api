import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/common/application/result';
import { toSlug } from '~/common/utils/slugify';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import { ProductVariantType } from '../../../domain/enums/product-variant-type.enum';
import {
  ActorCannotCreateProductDraftError,
  InvalidProductVariantConfigurationError,
  ProductNotFoundError,
  ProductSlugAlreadyExistsError
} from '../../errors/product-app.error';
import { ProductRepository } from '../../ports/product.repository';
import type { ProductDraftSummary } from '../../product.types';

export interface UpdateProductDetailsInput {
  title?: string;
  description?: string;
  whoMade?: ProductDraftSummary['whoMade'];
  isDigital?: boolean;
  nonTaxable?: boolean;
  variantGroupName?: string;
  variantSubGroupName?: string;
}

type UpdateProductDetailsError =
  | ActorCannotCreateProductDraftError
  | InvalidProductVariantConfigurationError
  | ProductNotFoundError
  | ProductSlugAlreadyExistsError;

@Injectable()
export class UpdateProductDetailsUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly shopRepository: ShopRepository
  ) {}

  async execute(
    actor: AuthenticatedUser,
    productId: string,
    input: UpdateProductDetailsInput
  ): Promise<Result<ProductDraftSummary, UpdateProductDetailsError>> {
    const existingProduct = await this.productRepository.findById(productId);

    if (!existingProduct) {
      return err(new ProductNotFoundError(productId));
    }

    const canManageAnyShop = actor.roles.includes('admin');

    if (!canManageAnyShop) {
      const ownedShop = await this.shopRepository.findOwnedById(
        existingProduct.shopId,
        actor.userId
      );

      if (!ownedShop) {
        return err(new ActorCannotCreateProductDraftError());
      }
    }

    const nextProduct = {
      title: input.title?.trim() ?? existingProduct.title,
      description: input.description?.trim() ?? existingProduct.description,
      whoMade: input.whoMade ?? existingProduct.whoMade,
      isDigital: input.isDigital ?? existingProduct.isDigital,
      nonTaxable: input.nonTaxable ?? existingProduct.nonTaxable,
      variantGroupName: input.variantGroupName?.trim() ?? existingProduct.variantGroupName,
      variantSubGroupName:
        input.variantSubGroupName?.trim() ?? existingProduct.variantSubGroupName,
    };

    const variantValidationError = validateVariantLabels(
      existingProduct.variantType ?? ProductVariantType.NONE,
      nextProduct.variantGroupName,
      nextProduct.variantSubGroupName
    );

    if (variantValidationError) {
      return err(variantValidationError);
    }

    const slug = toSlug(nextProduct.title);
    const slugConflict = await this.productRepository.findByShopIdAndSlug(
      existingProduct.shopId,
      slug
    );

    if (slugConflict && slugConflict.id !== existingProduct.id) {
      return err(new ProductSlugAlreadyExistsError(slug));
    }

    const product = await this.productRepository.updateDetails({
      productId,
      title: nextProduct.title,
      slug,
      description: nextProduct.description,
      whoMade: nextProduct.whoMade,
      isDigital: nextProduct.isDigital,
      nonTaxable: nextProduct.nonTaxable,
      variantGroupName: nextProduct.variantGroupName,
      variantSubGroupName: nextProduct.variantSubGroupName,
    });

    if (!product) {
      return err(new ProductNotFoundError(productId));
    }

    return ok(product);
  }
}

function validateVariantLabels(
  variantType: ProductVariantType,
  variantGroupName?: string,
  variantSubGroupName?: string
): InvalidProductVariantConfigurationError | null {
  const hasGroupName = Boolean(variantGroupName?.trim());
  const hasSubGroupName = Boolean(variantSubGroupName?.trim());

  if (variantType === ProductVariantType.NONE) {
    if (hasGroupName || hasSubGroupName) {
      return new InvalidProductVariantConfigurationError(
        'Products without variants cannot define variant group names'
      );
    }

    return null;
  }

  if (!hasGroupName) {
    return new InvalidProductVariantConfigurationError(
      'Variant group name is required when variants are enabled'
    );
  }

  if (variantType === ProductVariantType.SINGLE && hasSubGroupName) {
    return new InvalidProductVariantConfigurationError(
      'Single-variant products cannot define a variant sub-group name'
    );
  }

  if (variantType === ProductVariantType.COMBINE && !hasSubGroupName) {
    return new InvalidProductVariantConfigurationError(
      'Combined variants require a variant sub-group name'
    );
  }

  return null;
}
