import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ShopRepository } from '~/domains/shop/app/ports/shop.repository';
import { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import { ProductState } from '../../../domain/enums/product-state.enum';
import { ProductCommandRepository } from '../../ports/product-command.repository';
import { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import type { ProductDraftSummary } from '../../product.types';
import { validatePublishReadiness } from '../publish-product/publish-product-readiness';

export enum BulkMutateShopProductsAction {
  PUBLISH = 'publish',
  DEACTIVATE = 'deactivate',
  REMOVE = 'remove',
}

export interface BulkMutateShopProductsInput {
  shopId: string;
  productIds: string[];
  action: BulkMutateShopProductsAction;
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
          failed: input.productIds.map(id => ({
            id,
            code: 'FORBIDDEN',
            reason: 'Actor is not allowed to manage products for this shop',
          })),
        };
      }
    }

    const succeededIds: string[] = [];
    const failed: BulkMutateShopProductsFailure[] = [];

    for (const productId of input.productIds) {
      const product = await this.sellerProductQueryRepository.findById(productId);

      if (!product || product.shopId !== input.shopId) {
        failed.push({
          id: productId,
          code: 'ProductNotFoundError',
          reason: `Product "${productId}" was not found`,
        });
        continue;
      }

      const mutationResult = await this.mutateProduct(actor, product, input.action);

      if (!mutationResult.ok) {
        failed.push({
          id: productId,
          code: mutationResult.code,
          reason: mutationResult.reason,
        });
        continue;
      }

      succeededIds.push(productId);
    }

    return {
      succeededIds,
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

      const publishedProduct = await this.productCommandRepository.publish(product.id);

      if (!publishedProduct) {
        return {
          ok: false,
          code: 'ProductNotFoundError',
          reason: `Product "${product.id}" was not found`,
        };
      }

      await this.recordAudit(actor, publishedProduct, 'product.published');
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
        reason: `Product "${product.id}" was not found`,
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
