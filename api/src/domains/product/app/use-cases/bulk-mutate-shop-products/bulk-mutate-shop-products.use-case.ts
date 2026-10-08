import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { ShopRepository } from '~/domains/shop/app/ports/shop.repository';
import { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import { ProductState } from '../../../domain/enums/product-state.enum';
import { ProductCommandRepository } from '../../ports/product-command.repository';
import { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import { dispatchCatalogProductProjections } from '../../catalog-product-projection-dispatch';
import type { ProductDraftSummary } from '../../product.types';
import { validatePublishReadiness } from '../publish-product/publish-product-readiness';

export enum BulkMutateShopProductsAction {
  PUBLISH = 'publish',
  DEACTIVATE = 'deactivate',
  REMOVE = 'remove',
}

export interface BulkMutateShopProductsInput {
  shopId: string;
  productPublicIds: string[];
  action: BulkMutateShopProductsAction;
  idempotencyKey?: string;
}

export interface BulkMutateShopProductsFailure {
  id: string;
  code: string;
  reason: string;
}

export interface BulkMutateShopProductsResult {
  succeededIds: string[];
  failed: BulkMutateShopProductsFailure[];
}

@Injectable()
export class BulkMutateShopProductsUseCase {
  constructor(
    private readonly sellerProductQueryRepository: SellerProductQueryRepository,
    private readonly productCommandRepository: ProductCommandRepository,
    private readonly shopRepository: ShopRepository,
    private readonly auditLogService: AuditLogService,
    private readonly jobDispatcher: JobDispatcher,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    input: BulkMutateShopProductsInput,
  ): Promise<BulkMutateShopProductsResult> {
    const canManageAnyShop = actor.roles.includes('admin');

    if (!canManageAnyShop) {
      const ownedShop = await this.shopRepository.findOwnedById(
        input.shopId,
        actor.userId,
      );

      if (!ownedShop) {
        return {
          succeededIds: [],
          failed: input.productPublicIds.map(publicId => ({
            id: publicId,
            code: 'FORBIDDEN',
            reason: 'Actor is not allowed to manage products for this shop',
          })),
        };
      }
    }

    const products = await this.sellerProductQueryRepository.findSummariesByPublicIds(
      input.productPublicIds,
    );

    const succeededPublicIds: string[] = [];
    const succeededInternalIds: string[] = [];
    const failed: BulkMutateShopProductsFailure[] = [];

    // Identifiers are resolved once, up front. Public ids stay on the response
    // and internal ids stay inside the application for commands and jobs.
    for (const [index, productPublicId] of input.productPublicIds.entries()) {
      const product = products[index];

      if (!product || product.shopId !== input.shopId) {
        failed.push({
          id: productPublicId,
          code: 'ProductNotFoundError',
          reason: `Product "${productPublicId}" was not found`,
        });
        continue;
      }

      const mutationResult = await this.mutateProduct(actor, product, input.action);

      if (!mutationResult.ok) {
        failed.push({
          id: productPublicId,
          code: mutationResult.code,
          reason: mutationResult.reason,
        });
        continue;
      }

      succeededPublicIds.push(productPublicId);
      succeededInternalIds.push(product.id);
    }

    // Publishing makes a Product eligible for every all-Products Sale, and
    // deactivating or removing one must drop its stored price. Both are
    // catalog-visible changes, so the affected projections are refreshed here
    // exactly as the single-Product actions do.
    if (succeededInternalIds.length > 0) {
      await dispatchCatalogProductProjections(this.jobDispatcher, succeededInternalIds);
    }

    return {
      succeededIds: succeededPublicIds,
      failed,
    };
  }

  private async mutateProduct(
    actor: AuthenticatedUser,
    product: ProductDraftSummary,
    action: BulkMutateShopProductsAction,
  ): Promise<
    | { ok: true }
    | { ok: false; code: string; reason: string }
  > {
    if (action === BulkMutateShopProductsAction.PUBLISH) {
      const readinessError = validatePublishReadiness(product);

      if (readinessError) {
        return {
          ok: false,
          code: readinessError.code,
          reason: readinessError.message,
        };
      }

      const outcome = await this.productCommandRepository.publish(product.id);

      if (outcome.status === 'product_not_found') {
        return {
          ok: false,
          code: 'ProductNotFoundError',
          reason: `Product "${product.publicId}" was not found`,
        };
      }

      if (outcome.status === 'shipping_profile_unavailable') {
        return {
          ok: false,
          code: 'ProductNotReadyToPublishError',
          reason: `Product "${product.publicId}" lost its checkout-ready shipping profile before publishing`,
        };
      }

      await this.recordAudit(actor, outcome.product, 'product.published');
      return { ok: true };
    }

    const nextState = action === BulkMutateShopProductsAction.DEACTIVATE
      ? ProductState.INACTIVE
      : ProductState.REMOVED;

    if (product.state === ProductState.UNAVAILABLE) {
      return {
        ok: false,
        code: 'ProductStateConflict',
        reason: 'Unavailable products cannot be changed by shop owners',
      };
    }

    if (product.state === nextState) {
      return { ok: true };
    }

    if (
      action === BulkMutateShopProductsAction.DEACTIVATE
      && product.state === ProductState.DRAFT
    ) {
      return {
        ok: false,
        code: 'ProductStateConflict',
        reason: 'Draft products cannot be deactivated before they are published',
      };
    }

    if (
      action === BulkMutateShopProductsAction.DEACTIVATE
      && product.state === ProductState.REMOVED
    ) {
      return {
        ok: false,
        code: 'ProductStateConflict',
        reason: 'Removed products cannot be deactivated',
      };
    }

    const updatedProduct = await this.productCommandRepository.updateState(product.id, nextState);

    if (!updatedProduct) {
      return {
        ok: false,
        code: 'ProductNotFoundError',
        reason: `Product "${product.publicId}" was not found`,
      };
    }

    await this.recordAudit(
      actor,
      updatedProduct,
      nextState === ProductState.INACTIVE
        ? 'product.deactivated'
        : 'product.removed',
    );

    return { ok: true };
  }

  private async recordAudit(
    actor: AuthenticatedUser,
    product: ProductDraftSummary,
    action: string,
  ): Promise<void> {
    await this.auditLogService.record({
      action,
      entityType: 'product',
      entityId: product.id,
      summary: {
        shopId: product.shopId,
        state: product.state,
        title: product.title,
      },
      actor: {
        actorId: actor.userId,
        actorEmail: actor.email,
        sessionId: actor.sessionId,
      },
    });
  }
}
