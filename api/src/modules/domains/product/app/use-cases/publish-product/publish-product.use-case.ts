import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/common/application/result';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import { AuditLogService } from '~/modules/shared/audit/app/audit-log.service';
import {
  ActorCannotCreateProductDraftError,
  ProductNotFoundError,
  ProductNotReadyToPublishError
} from '../../errors/product-app.error';
import { ProductRepository } from '../../ports/product.repository';
import type { ProductDraftSummary } from '../../product.types';
import { validatePublishReadiness } from './publish-product-readiness';

type PublishProductError =
  | ActorCannotCreateProductDraftError
  | ProductNotFoundError
  | ProductNotReadyToPublishError;

@Injectable()
export class PublishProductUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly shopRepository: ShopRepository,
    private readonly auditLogService: AuditLogService
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

    await this.auditLogService.record({
      action: 'product.published',
      entityType: 'product',
      entityId: publishedProduct.id,
      summary: {
        shopId: publishedProduct.shopId,
        state: publishedProduct.state,
        title: publishedProduct.title,
      },
      actor: {
        actorId: actor.userId,
        actorEmail: actor.email,
        sessionId: actor.sessionId,
      },
    });

    return ok(publishedProduct);
  }
}
