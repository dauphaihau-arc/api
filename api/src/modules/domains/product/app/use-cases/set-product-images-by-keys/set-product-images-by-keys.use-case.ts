import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/common/application/result';
import { appJobDeduplicationKey, appJobName } from '~/common/jobs/job.types';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import { JobDispatcher } from '~/modules/shared/queue/app/ports/job-dispatcher';
import {
  ActorCannotCreateProductDraftError,
  ProductNotFoundError,
} from '../../errors/product-app.error';
import { ProductCommandRepository } from '../../ports/product-command.repository';
import { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import type { ProductDraftSummary } from '../../product.types';

export interface SetProductImagesByKeysInput {
  images: Array<{
    storageKey: string;
    rank: number;
  }>;
}

type SetProductImagesByKeysError =
  | ActorCannotCreateProductDraftError
  | ProductNotFoundError;

@Injectable()
export class SetProductImagesByKeysUseCase {
  constructor(
    private readonly sellerProductQueryRepository: SellerProductQueryRepository,
    private readonly productCommandRepository: ProductCommandRepository,
    private readonly shopRepository: ShopRepository,
    private readonly jobDispatcher: JobDispatcher,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    productId: string,
    input: SetProductImagesByKeysInput,
  ): Promise<Result<ProductDraftSummary, SetProductImagesByKeysError>> {
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

    const replacedImages = await this.productCommandRepository.replaceImages({
      productId,
      images: input.images.map((image) => ({
        storageKey: image.storageKey.trim(),
        rank: image.rank,
      })),
    });

    if (!replacedImages) {
      return err(new ProductNotFoundError(productId));
    }

    await this.jobDispatcher.dispatch(
      appJobName.generateProductImageVariants,
      { productId },
      {
        deduplicationKey: appJobDeduplicationKey.generateProductImageVariants(productId),
      },
    );
    await this.jobDispatcher.dispatch(
      appJobName.projectCatalogProduct,
      { productId: replacedImages.product.id },
      {
        deduplicationKey: appJobDeduplicationKey.projectCatalogProduct(
          replacedImages.product.id,
        ),
      },
    );

    return ok(replacedImages.product);
  }
}
