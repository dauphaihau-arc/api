import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/common/application/result';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import { ProductState } from '../../../domain/enums/product-state.enum';
import { ProductVariantType } from '../../../domain/enums/product-variant-type.enum';
import {
  ActorCannotCreateProductDraftError,
  ProductNotFoundError,
  ProductNotReadyToPublishError
} from '../../errors/product-app.error';
import { ProductRepository } from '../../ports/product.repository';
import type { ProductDraftSummary } from '../../product.types';

type PublishProductError =
  | ActorCannotCreateProductDraftError
  | ProductNotFoundError
  | ProductNotReadyToPublishError;

@Injectable()
export class PublishProductUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly shopRepository: ShopRepository
  ) {}

  async execute(
    actor: AuthenticatedUser,
    productId: string
  ): Promise<Result<ProductDraftSummary, PublishProductError>> {
    const product = await this.productRepository.findById(productId);

    if (!product) {
      return err(new ProductNotFoundError(productId));
    }

    const canManageAnyShop = actor.roles.includes('admin');

    if (!canManageAnyShop) {
      const ownedShop = await this.shopRepository.findOwnedById(
        product.shopId,
        actor.userId
      );

      if (!ownedShop) {
        return err(new ActorCannotCreateProductDraftError());
      }
    }

    const readinessError = validatePublishReadiness(product);

    if (readinessError) {
      return err(readinessError);
    }

    const publishedProduct = await this.productRepository.publish(productId);

    if (!publishedProduct) {
      return err(new ProductNotFoundError(productId));
    }

    return ok(publishedProduct);
  }
}

function validatePublishReadiness(
  product: ProductDraftSummary
): ProductNotReadyToPublishError | null {
  if (
    product.state === ProductState.REMOVED
    || product.state === ProductState.UNAVAILABLE
  ) {
    return new ProductNotReadyToPublishError(
      'Removed or unavailable products cannot be published'
    );
  }

  if (product.title.trim().length < 2) {
    return new ProductNotReadyToPublishError(
      'Product title is required before publishing'
    );
  }

  if (product.description.trim().length < 2) {
    return new ProductNotReadyToPublishError(
      'Product description is required before publishing'
    );
  }

  if (!product.categoryId) {
    return new ProductNotReadyToPublishError(
      'Product category is required before publishing'
    );
  }

  if (product.images.length === 0) {
    return new ProductNotReadyToPublishError(
      'At least one product image is required before publishing'
    );
  }

  if (!product.shipping) {
    return new ProductNotReadyToPublishError(
      'Shipping configuration is required before publishing'
    );
  }

  if (product.shipping.destinations.length === 0) {
    return new ProductNotReadyToPublishError(
      'At least one shipping destination is required before publishing'
    );
  }

  if (product.inventory.length === 0) {
    return new ProductNotReadyToPublishError(
      'Inventory is required before publishing'
    );
  }

  const variantType = product.variantType ?? ProductVariantType.NONE;

  if (variantType === ProductVariantType.NONE) {
    if (product.inventory.length !== 1) {
      return new ProductNotReadyToPublishError(
        'Products without variants must have exactly one inventory row before publishing'
      );
    }
  }
  else {
    if (product.variants.length === 0) {
      return new ProductNotReadyToPublishError(
        'Variant-enabled products must define variants before publishing'
      );
    }

    if (product.inventory.length !== product.variants.length) {
      return new ProductNotReadyToPublishError(
        'Variant-enabled products must have one inventory row per variant before publishing'
      );
    }
  }

  return null;
}
