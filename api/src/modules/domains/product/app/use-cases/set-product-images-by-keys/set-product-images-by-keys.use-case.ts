import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/common/application/result';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import {
  ActorCannotCreateProductDraftError,
  ProductNotFoundError
} from '../../errors/product-app.error';
import { ProductRepository } from '../../ports/product.repository';
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
    private readonly productRepository: ProductRepository,
    private readonly shopRepository: ShopRepository
  ) {}

  async execute(
    actor: AuthenticatedUser,
    productId: string,
    input: SetProductImagesByKeysInput
  ): Promise<Result<ProductDraftSummary, SetProductImagesByKeysError>> {
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

    const replacedImages = await this.productRepository.replaceImages({
      productId,
      images: input.images.map((image) => ({
        storageKey: image.storageKey.trim(),
        rank: image.rank,
      })),
    });

    if (!replacedImages) {
      return err(new ProductNotFoundError(productId));
    }

    return ok(replacedImages.product);
  }
}
