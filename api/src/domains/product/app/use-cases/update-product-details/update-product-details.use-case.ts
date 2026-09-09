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
import {
  ActorCannotCreateProductDraftError,
  CategoryNotFoundError,
  ProductNotFoundError,
  ProductSlugAlreadyExistsError,
  ProductVersionConflictError,
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
  categoryId?: string;
  tags?: string[];
  productVersion: number;
}

type UpdateProductDetailsError =
  | ActorCannotCreateProductDraftError
  | ProductNotFoundError
  | CategoryNotFoundError
  | ProductSlugAlreadyExistsError
  | ProductVersionConflictError;

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

    if (existingProduct.productVersion !== input.productVersion) {
      return err(new ProductVersionConflictError(existingProduct));
    }

    const nextProduct = {
      title: input.title?.trim() ?? existingProduct.title,
      description: input.description?.trim() ?? existingProduct.description,
      whoMade: input.whoMade ?? existingProduct.whoMade,
      isDigital: input.isDigital ?? existingProduct.isDigital,
      nonTaxable: input.nonTaxable ?? existingProduct.nonTaxable,
      tags: sanitizeTags(input.tags) ?? existingProduct.tags ?? [],
      categoryId: input.categoryId ?? existingProduct.categoryId,
    };

    if (input.categoryId) {
      const category = await this.categoryRepository.findById(input.categoryId);

      if (!category) {
        return err(new CategoryNotFoundError(input.categoryId));
      }
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
      expectedProductVersion: input.productVersion,
      title: nextProduct.title,
      slug,
      description: nextProduct.description,
      whoMade: nextProduct.whoMade,
      isDigital: nextProduct.isDigital,
      nonTaxable: nextProduct.nonTaxable,
      categoryId: nextProduct.categoryId,
      tags: nextProduct.tags,
    });

    if (!product) {
      const currentProduct = await this.sellerProductQueryRepository.findById(productId);
      return currentProduct
        ? err(new ProductVersionConflictError(currentProduct))
        : err(new ProductNotFoundError(productId));
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
        deduplicationMode: 'coalesce-latest',
      },
    );

    return ok(product);
  }
}


function sanitizeTags(tags?: string[]): string[] | undefined {
  return tags?.map((tag) => tag.trim()).filter(Boolean);
}
