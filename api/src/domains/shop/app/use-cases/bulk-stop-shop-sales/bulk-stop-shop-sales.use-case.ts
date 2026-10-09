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
import { ShopAccessDeniedError, ShopNotFoundError } from '../../errors/shop-app.error';
import type { ShopSaleSummary } from '../../shop.types';
import { toShopSaleSummary } from '../../sale-summary';
import { loadProductReferences, selectProductReferences } from '../../product-reference';
import { dispatchShopProjection } from '../shop-promotion-catalog-projection';

export interface BulkStopShopSalesFailure {
  id: string;
  code: string;
  reason: string;
}

export interface BulkStopShopSalesResult {
  results: ShopSaleSummary[];
  succeededIds: string[];
  failed: BulkStopShopSalesFailure[];
}

/**
 * Stops many Sales in one request using the same state rules as the individual
 * actions: a scheduled Sale is cancelled, an active Sale is ended, and a Sale
 * that already reached either final state is reported as a failure instead of
 * being silently changed or removed.
 */
@Injectable()
export class BulkStopShopSalesUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly jobDispatcher: JobDispatcher,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    shopId: string,
    salePublicIds: string[],
  ): Promise<BulkStopShopSalesResult> {
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

    const promotions = await entityManager.getRepository(PromotionEntity).find(
      {
        publicId: { $in: salePublicIds },
        shop: shopId,
        applicationKind: PromotionApplicationKind.SALE,
      },
      { populate: ['shop', 'products'] },
    );
    const promotionsByPublicId = new Map(promotions.map((promotion) => [promotion.publicId, promotion]));
    const referencesById = await loadProductReferences(
      entityManager,
      promotions.flatMap((promotion) => promotion.products.getItems().map((target) => target.productId)),
    );

    const now = this.clock.now();
    const results: ShopSaleSummary[] = [];
    const succeededIds: string[] = [];
    const failed: BulkStopShopSalesFailure[] = [];

    for (const salePublicId of salePublicIds) {
      const promotion = promotionsByPublicId.get(salePublicId);

      if (!promotion) {
        failed.push({
          id: salePublicId,
          code: 'NOT_FOUND',
          reason: 'Sale not found',
        });
        continue;
      }

      const status = resolvePromotionStatus(promotion, now);

      if (status === PromotionStatus.SCHEDULED) {
        promotion.cancelledAt = now;
      }
      else if (status === PromotionStatus.ACTIVE) {
        promotion.endedAt = now;
      }
      else {
        failed.push({
          id: salePublicId,
          code: 'NOT_STOPPABLE',
          reason: `This sale is already ${status}`,
        });
        continue;
      }
      succeededIds.push(salePublicId);

      results.push(toShopSaleSummary(
        promotion,
        promotion.productScope === PromotionProductScope.ALL
          ? []
          : selectProductReferences(promotion.products.getItems().map((target) => target.productId), referencesById),
        now,
      ));
    }

    if (succeededIds.length === 0) {
      return { results, succeededIds, failed };
    }

    await entityManager.flush();

    await this.dispatchProjections(results);

    return { results, succeededIds, failed };
  }

  /**
   * One refresh per stopped Sale, so a targeted Sale reprices only its targets
   * and an all-Products Sale reprices its whole shop.
   */
  private async dispatchProjections(results: ShopSaleSummary[]): Promise<void> {
    for (const sale of results) {
      await dispatchShopProjection(
        this.jobDispatcher,
        sale.shopId,
        sale.productScope === PromotionProductScope.ALL || sale.productIds.length === 0
          ? undefined
          : sale.productIds,
        `sale-${sale.id}-bulk-stop`,
      );
    }
  }
}
