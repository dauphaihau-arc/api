import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/platform/application/result';
import { appJobDeduplicationKey } from '~/platform/jobs/app-job-deduplication';
import { appJobName } from '~/platform/jobs/app-job.names';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ShopRepository } from '~/domains/shop/app/ports/shop.repository';
import { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import {
  ActorCannotCreateProductDraftError,
  ProductNotFoundError,
  ProductNotReadyToPublishError,
} from '../../errors/product-app.error';
import { ProductCommandRepository } from '../../ports/product-command.repository';
import { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import type { ProductDraftSummary } from '../../product.types';
import { validatePublishReadiness } from './publish-product-readiness';

type PublishProductError =
  | ActorCannotCreateProductDraftError
  | ProductNotFoundError
  | ProductNotReadyToPublishError;

@Injectable()
export class PublishProductUseCase {
  constructor(
    private readonly sellerProductQueryRepository: SellerProductQueryRepository,
    private readonly productCommandRepository: ProductCommandRepository,
    private readonly shopRepository: ShopRepository,
    private readonly auditLogService: AuditLogService,
    private readonly jobDispatcher?: JobDispatcher,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    productId: string,
  ): Promise<Result<ProductDraftSummary, PublishProductError>> {
    const product = await this.sellerProductQueryRepository.findById(productId);

    if (!product) {
      return err(new ProductNotFoundError(productId));
    }

    const canManageAnyShop = actor.roles.includes('admin');

    if (!canManageAnyShop) {
      const ownedShop = await this.shopRepository.findOwnedById(
        product.shopId,
        actor.userId,
      );

      if (!ownedShop) {
        return err(new ActorCannotCreateProductDraftError());
      }
    }

    const readinessError = validatePublishReadiness(product);

    if (readinessError) {
      return err(readinessError);
    }

    const publishedProduct = await this.productCommandRepository.publish(productId);

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
    await this.jobDispatcher?.dispatch(
      appJobName.projectCatalogProduct,
      { productId: publishedProduct.id },
      {
        deduplicationKey: appJobDeduplicationKey.projectCatalogProduct(
          publishedProduct.id,
        ),
      },
    );

    return ok(publishedProduct);
  }
}
