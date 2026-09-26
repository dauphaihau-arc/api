import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/platform/application/result';
import { appJobDeduplicationKey } from '~/platform/jobs/app-job-deduplication';
import { appJobName } from '~/platform/jobs/app-job.names';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ShopRepository } from '~/domains/shop/app/ports/shop.repository';
import { ShippingProfileRepository } from '~/domains/shipping/app/ports/shipping-profile.repository';
import { ShippingProfileStatus } from '~/domains/shipping/domain/enums/shipping-profile-status.enum';
import {
  collectShippingProfileReadinessIssues,
  isShippingProfileCheckoutReady,
} from '~/domains/shipping/domain/shipping-profile-readiness';
import { ProductState } from '../../../domain/enums/product-state.enum';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import {
  ActorCannotCreateProductDraftError,
  InvalidProductVariantConfigurationError,
  ProductNotFoundError,
} from '../../errors/product-app.error';
import { ProductCommandRepository } from '../../ports/product-command.repository';
import { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import type { ProductDraftSummary } from '../../product.types';

export interface AssignProductShippingProfileInput {
  shippingProfileId?: string | null;
}

type AssignProductShippingProfileError =
  | ActorCannotCreateProductDraftError
  | InvalidProductVariantConfigurationError
  | ProductNotFoundError;

@Injectable()
export class AssignProductShippingProfileUseCase {
  constructor(
    private readonly sellerProductQueryRepository: SellerProductQueryRepository,
    private readonly productCommandRepository: ProductCommandRepository,
    private readonly shopRepository: ShopRepository,
    private readonly shippingProfileRepository: ShippingProfileRepository,
    private readonly jobDispatcher?: JobDispatcher,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    productId: string,
    input: AssignProductShippingProfileInput,
  ): Promise<Result<ProductDraftSummary, AssignProductShippingProfileError>> {
    const existingProduct = await this.sellerProductQueryRepository.findById(productId);

    if (!existingProduct) {
      return err(new ProductNotFoundError(productId));
    }

    if (!actor.roles.includes('admin')) {
      const ownedShop = await this.shopRepository.findOwnedById(
        existingProduct.shopId,
        actor.userId,
      );

      if (!ownedShop) {
        return err(new ActorCannotCreateProductDraftError());
      }
    }

    const shippingProfileId = input.shippingProfileId ?? undefined;

    if (shippingProfileId) {
      const profile = await this.shippingProfileRepository.findById(
        existingProduct.shopId,
        shippingProfileId,
      );

      if (!profile) {
        return err(
          new InvalidProductVariantConfigurationError(
            'The selected shipping profile does not belong to this shop',
          ),
        );
      }

      if (profile.status === ShippingProfileStatus.ARCHIVED) {
        return err(
          new InvalidProductVariantConfigurationError(
            'Archived shipping profiles cannot be assigned to a product',
          ),
        );
      }

      // A published Product must stay purchasable, so it can only hold a
      // profile that can price a checkout right now. Unpublished Products may
      // hold a work-in-progress profile.
      if (
        existingProduct.state === ProductState.ACTIVE
        && !isShippingProfileCheckoutReady(profile)
      ) {
        return err(
          new InvalidProductVariantConfigurationError(
            `Shipping profile "${profile.name}" cannot price a checkout yet: ${collectShippingProfileReadinessIssues(profile).join(', ')}`,
          ),
        );
      }
    }

    if (existingProduct.state === ProductState.ACTIVE && !shippingProfileId) {
      return err(
        new InvalidProductVariantConfigurationError(
          'A published product must keep a checkout-ready shipping profile',
        ),
      );
    }

    const outcome = await this.productCommandRepository.assignShippingProfile({
      productId,
      shippingProfileId,
    });

    if (outcome.status === 'product_not_found') {
      return err(new ProductNotFoundError(productId));
    }

    // The repository re-runs the same guards under the Shipping Profile and
    // Product row locks, so a concurrent archive or readiness-degrading profile
    // edit is rejected here even when the pre-checks above observed a usable
    // profile.
    if (outcome.status === 'shipping_profile_unavailable') {
      const message = outcome.reason === 'archived'
        ? 'Archived shipping profiles cannot be assigned to a product'
        : outcome.reason === 'not_checkout_ready'
          ? 'The selected shipping profile cannot price a checkout yet'
          : 'The selected shipping profile does not belong to this shop';

      return err(new InvalidProductVariantConfigurationError(message));
    }

    const product = outcome.product;

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
