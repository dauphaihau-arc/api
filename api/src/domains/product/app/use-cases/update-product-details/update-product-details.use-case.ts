import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/platform/application/result';
import { appJobDeduplicationKey } from '~/platform/jobs/app-job-deduplication';
import { appJobName } from '~/platform/jobs/app-job.names';
import { toSlug } from '~/platform/utils/slugify';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ShopRepository } from '~/domains/shop/app/ports/shop.repository';
import { CategoryRepository } from '~/domains/category/app/ports/category.repository';
import { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { ProductVariantType } from '../../../domain/enums/product-variant-type.enum';
import {
  ActorCannotCreateProductDraftError,
  CategoryNotFoundError,
  InvalidProductVariantConfigurationError,
  ProductNotFoundError,
  ProductSlugAlreadyExistsError,
} from '../../errors/product-app.error';
import { ProductCommandRepository } from '../../ports/product-command.repository';
import { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import type { ProductDraftSummary } from '../../product.types';

export interface UpdateProductDetailsInput {
  title?: string;
  description?: string;
  whoMade?: ProductDraftSummary['whoMade'];
  isDigital?: boolean;
  nonTaxable?: boolean;
  variantGroupName?: string;
  variantSubGroupName?: string;
  categoryId?: string;
  tags?: string[];
}

type UpdateProductDetailsError =
  | ActorCannotCreateProductDraftError
  | InvalidProductVariantConfigurationError
  | ProductNotFoundError
  | CategoryNotFoundError
  | ProductSlugAlreadyExistsError;

@Injectable()
export class UpdateProductDetailsUseCase {
  constructor(
    private readonly sellerProductQueryRepository: SellerProductQueryRepository,
    private readonly productCommandRepository: ProductCommandRepository,
    private readonly shopRepository: ShopRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly auditLogService: AuditLogService,
    private readonly jobDispatcher?: JobDispatcher,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    productId: string,
    input: UpdateProductDetailsInput,
  ): Promise<Result<ProductDraftSummary, UpdateProductDetailsError>> {
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

    const nextProduct = {
      title: input.title?.trim() ?? existingProduct.title,
      description: input.description?.trim() ?? existingProduct.description,
      whoMade: input.whoMade ?? existingProduct.whoMade,
      isDigital: input.isDigital ?? existingProduct.isDigital,
      nonTaxable: input.nonTaxable ?? existingProduct.nonTaxable,
      variantGroupName: input.variantGroupName?.trim() ?? existingProduct.variantGroupName,
      variantSubGroupName:
        input.variantSubGroupName?.trim() ?? existingProduct.variantSubGroupName,
      tags: sanitizeTags(input.tags) ?? existingProduct.tags ?? [],
      categoryId: input.categoryId ?? existingProduct.categoryId,
    };

    if (input.categoryId) {
      const category = await this.categoryRepository.findById(input.categoryId);

      if (!category) {
        return err(new CategoryNotFoundError(input.categoryId));
      }
    }
    const variantValidationError = validateVariantLabels(
      existingProduct.variantType ?? ProductVariantType.NONE,
      nextProduct.variantGroupName,
      nextProduct.variantSubGroupName,
    );

    if (variantValidationError) {
      return err(variantValidationError);
    }

    const slug = toSlug(nextProduct.title);
    const slugConflict = await this.sellerProductQueryRepository.findByShopIdAndSlug(
      existingProduct.shopId,
      slug,
    );

    if (slugConflict && slugConflict.id !== existingProduct.id) {
      return err(new ProductSlugAlreadyExistsError(slug));
    }

    const product = await this.productCommandRepository.updateDetails({
      productId,
      title: nextProduct.title,
      slug,
      description: nextProduct.description,
      whoMade: nextProduct.whoMade,
      isDigital: nextProduct.isDigital,
      nonTaxable: nextProduct.nonTaxable,
      variantGroupName: nextProduct.variantGroupName,
      variantSubGroupName: nextProduct.variantSubGroupName,
      categoryId: nextProduct.categoryId,
      tags: nextProduct.tags,
    });

    if (!product) {
      return err(new ProductNotFoundError(productId));
    }

    await this.auditLogService.record({
      action: 'product.details.updated',
      entityType: 'product',
      entityId: product.id,
      summary: {
        shopId: product.shopId,
        title: product.title,
        slug: product.slug,
        isDigital: product.isDigital,
        nonTaxable: product.nonTaxable,
      },
      actor: {
        actorId: actor.userId,
        actorEmail: actor.email,
        sessionId: actor.sessionId,
      },
    });
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

function validateVariantLabels(
  variantType: ProductVariantType,
  variantGroupName?: string,
  variantSubGroupName?: string,
): InvalidProductVariantConfigurationError | null {
  const hasGroupName = Boolean(variantGroupName?.trim());
  const hasSubGroupName = Boolean(variantSubGroupName?.trim());

  if (variantType === ProductVariantType.NONE) {
    if (hasGroupName || hasSubGroupName) {
      return new InvalidProductVariantConfigurationError(
        'Products without variants cannot define variant group names',
      );
    }

    return null;
  }

  if (!hasGroupName) {
    return new InvalidProductVariantConfigurationError(
      'Variant group name is required when variants are enabled',
    );
  }

  if (variantType === ProductVariantType.SINGLE && hasSubGroupName) {
    return new InvalidProductVariantConfigurationError(
      'Single-variant products cannot define a variant sub-group name',
    );
  }

  if (variantType === ProductVariantType.COMBINE && !hasSubGroupName) {
    return new InvalidProductVariantConfigurationError(
      'Combined variants require a variant sub-group name',
    );
  }

  return null;
}

function sanitizeTags(tags?: string[]): string[] | undefined {
  return tags?.map((tag) => tag.trim()).filter(Boolean);
}
