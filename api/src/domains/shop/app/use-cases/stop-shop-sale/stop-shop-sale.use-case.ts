import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { PromotionApplicationKind } from '~/domains/promotion/domain/enums/promotion-application-kind.enum';
import { PromotionProductScope } from '~/domains/promotion/domain/enums/promotion-product-scope.enum';
import { PromotionStatus } from '~/domains/promotion/domain/enums/promotion-status.enum';
import { resolvePromotionStatus } from '~/domains/promotion/domain/promotion-lifecycle';
import { PromotionEntity } from '~/domains/promotion/infra/persistence/entities/promotion.entity';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { Clock } from '~/platform/time/clock';
import { ShopEntity } from '../../../infra/persistence/entities/shop.entity';
import {
  SaleNotFoundError,
  SaleStopNotAllowedError,
  ShopAccessDeniedError,
  ShopNotFoundError,
} from '../../errors/shop-app.error';
import type { ShopSaleSummary } from '../../shop.types';
import { toShopSaleSummary } from '../../sale-summary';
import { dispatchShopProjection } from '../shop-promotion-catalog-projection';

/**
 * The irreversible stops a seller can apply to a Sale. Cancelling retires a
 * Sale that has not started; ending retires one that is currently running.
 * Neither is a deletion: the definition, its Product Scope and its scheduled
 * boundary jobs stay in place, and the Sale is simply never applied again.
 */
export enum ShopSaleStopAction {
  CANCEL = 'cancel',
  END = 'end',
}

@Injectable()
export class StopShopSaleUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly jobDispatcher: JobDispatcher,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    shopId: string,
    saleId: string,
    action: ShopSaleStopAction,
  ): Promise<ShopSaleSummary> {
    const entityManager = this.entityManager.fork();

    const shop = await entityManager.getRepository(ShopEntity).findOne(
      { id: shopId },
      { populate: ['ownerUser'] },
    );

    if (!shop) {
      throw new ShopNotFoundError();
    }

    if (shop.ownerUser.id !== actor.userId && !actor.roles.includes('admin')) {
      throw new ShopAccessDeniedError();
    }

    const promotion = await entityManager.getRepository(PromotionEntity).findOne(
      { id: saleId, shop: shopId, applicationKind: PromotionApplicationKind.SALE },
      { populate: ['shop', 'products'] },
    );

    if (!promotion) {
      throw new SaleNotFoundError();
    }

    const now = this.clock.now();
    const status = resolvePromotionStatus(promotion, now);

    if (
      (action === ShopSaleStopAction.CANCEL && status !== PromotionStatus.SCHEDULED)
      || (action === ShopSaleStopAction.END && status !== PromotionStatus.ACTIVE)
    ) {
      throw new SaleStopNotAllowedError(action, status);
    }

    if (action === ShopSaleStopAction.CANCEL) {
      promotion.cancelledAt = now;
    }
    else {
      promotion.endedAt = now;
    }

    await entityManager.flush();

    await this.dispatchProjection(promotion, action);

    return toShopSaleSummary(
      promotion,
      promotion.productScope === PromotionProductScope.ALL
        ? []
        : promotion.products.getItems().map((target) => target.productId),
      now,
    );
  }

  /**
   * Reprices the catalog now that the Sale no longer applies. An all-Products
   * Sale refreshes every current Product of its shop; a targeted one refreshes
   * just its targets.
   */
  private async dispatchProjection(
    promotion: PromotionEntity,
    action: ShopSaleStopAction,
  ): Promise<void> {
    const targetedProductIds = promotion.productScope === PromotionProductScope.ALL
      ? undefined
      : promotion.products.getItems().map((target) => target.productId);

    await dispatchShopProjection(
      this.jobDispatcher,
      promotion.shop.id,
      targetedProductIds,
      `sale-${promotion.id}-${action}`,
    );
  }
}
