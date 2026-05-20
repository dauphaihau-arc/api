import { Injectable } from '@nestjs/common';
import { err, ok, Result } from '~/common/application/result';
import { toSlug } from '~/common/utils/slugify';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { CategoryRepository } from '~/modules/domains/category/app/ports/category.repository';
import { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import { ProductVariantType } from '../../../domain/enums/product-variant-type.enum';
import { ProductWhoMade } from '../../../domain/enums/product-who-made.enum';
import {
  ActorCannotCreateProductDraftError,
  CategoryNotFoundError,
  InvalidProductVariantConfigurationError,
  ProductSlugAlreadyExistsError
} from '../../errors/product-app.error';
import { ProductRepository } from '../../ports/product.repository';
import type { ProductDraftSummary } from '../../product.types';

export interface CreateProductDraftInput {
  shopId: string;
  categoryId?: string;
  title: string;
  description: string;
  whoMade: ProductWhoMade;
  isDigital?: boolean;
  nonTaxable?: boolean;
  variantType?: ProductVariantType;
  variantGroupName?: string;
  variantSubGroupName?: string;
}

type CreateProductDraftError =
  | ActorCannotCreateProductDraftError
  | CategoryNotFoundError
  | InvalidProductVariantConfigurationError
  | ProductSlugAlreadyExistsError;

@Injectable()
export class CreateProductDraftUseCase {
  constructor(
    private readonly shopRepository: ShopRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly productRepository: ProductRepository
  ) {}

  async execute(
    actor: AuthenticatedUser,
    input: CreateProductDraftInput
  ): Promise<Result<ProductDraftSummary, CreateProductDraftError>> {
    const canManageAnyShop = actor.roles.includes('admin');
    const shop = canManageAnyShop
      ? await this.shopRepository.findById(input.shopId)
      : await this.shopRepository.findOwnedById(input.shopId, actor.userId);

    if (!shop) {
      return err(new ActorCannotCreateProductDraftError());
    }

    if (input.categoryId) {
      const category = await this.categoryRepository.findById(input.categoryId);

      if (!category) {
        return err(new CategoryNotFoundError(input.categoryId));
      }
    }

    const variantValidationError = this.validateVariantConfiguration(input);

    if (variantValidationError) {
      return err(variantValidationError);
    }

    const slug = toSlug(input.title);
    const existingProduct = await this.productRepository.findByShopIdAndSlug(
      input.shopId,
      slug
    );

    if (existingProduct) {
      return err(new ProductSlugAlreadyExistsError(slug));
    }

    const product = await this.productRepository.createDraft({
      shopId: input.shopId,
      categoryId: input.categoryId,
      title: input.title.trim(),
      slug,
      description: input.description.trim(),
      whoMade: input.whoMade,
      isDigital: input.isDigital ?? false,
      nonTaxable: input.nonTaxable ?? false,
      variantType: input.variantType,
      variantGroupName: input.variantGroupName?.trim() || undefined,
      variantSubGroupName: input.variantSubGroupName?.trim() || undefined,
    });

    return ok(product);
  }

  private validateVariantConfiguration(
    input: CreateProductDraftInput
  ): InvalidProductVariantConfigurationError | null {
    const variantType = input.variantType ?? ProductVariantType.NONE;
    const hasGroupName = Boolean(input.variantGroupName?.trim());
    const hasSubGroupName = Boolean(input.variantSubGroupName?.trim());

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
}
