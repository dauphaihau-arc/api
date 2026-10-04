import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { PromotionApplicationKind } from '~/domains/promotion/domain/enums/promotion-application-kind.enum';
import { PromotionProductScope } from '~/domains/promotion/domain/enums/promotion-product-scope.enum';
import { PromotionStatus } from '~/domains/promotion/domain/enums/promotion-status.enum';
import { resolvePromotionStatus } from '~/domains/promotion/domain/promotion-lifecycle';
import { PromotionCodeEntity } from '~/domains/promotion/infra/persistence/entities/promotion-code.entity';
import { PromotionEntity } from '~/domains/promotion/infra/persistence/entities/promotion.entity';
import { PromotionUsageEntity } from '~/domains/promotion/infra/persistence/entities/promotion-usage.entity';
import { Clock } from '~/platform/time/clock';
import { ShopEntity } from '../../../infra/persistence/entities/shop.entity';
import { ShopAccessDeniedError, ShopNotFoundError } from '../../errors/shop-app.error';
import type { ShopPromoCodeSummary } from '../../shop.types';
import { toShopPromoCodeSummary } from '../../promo-code-summary.mapper';

export interface BulkStopShopPromoCodesFailure {
  id: string;
  code: string;
  reason: string;
}

export interface BulkStopShopPromoCodesResult {
  results: ShopPromoCodeSummary[];
  succeededIds: string[];
  failed: BulkStopShopPromoCodesFailure[];
}

/**
 * Stops many Promo Codes in one request using the same state rules as the
 * individual actions: a scheduled Promo Code is cancelled, an active one is
 * ended, and one that already reached either final state is reported as a
 * failure instead of being silently changed or removed.
 */
@Injectable()
export class BulkStopShopPromoCodesUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    shopId: string,
    promoCodeIds: string[],
  ): Promise<BulkStopShopPromoCodesResult> {
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
        id: { $in: promoCodeIds },
        shop: shopId,
        applicationKind: PromotionApplicationKind.CHECKOUT_DISCOUNT,
      },
      { populate: ['shop', 'products'] },
    );
    const promotionsById = new Map(promotions.map((promotion) => [promotion.id, promotion]));
    const promotionIds = promotions.map((promotion) => promotion.id);

    const codeByPromotionId = new Map<string, string>();
    if (promotionIds.length > 0) {
      const codes = await entityManager.getRepository(PromotionCodeEntity).find({
        promotion: { $in: promotionIds },
      });
      for (const code of codes) {
        codeByPromotionId.set(code.promotion.id, code.code);
      }
    }

    const redemptionCountByPromotionId = new Map<string, number>();
    if (promotionIds.length > 0) {
      const usages = await entityManager.getRepository(PromotionUsageEntity).find({
        promotion: { $in: promotionIds },
      });
      for (const usage of usages) {
        const promotionId = usage.promotion.id;
        redemptionCountByPromotionId.set(
          promotionId,
          (redemptionCountByPromotionId.get(promotionId) ?? 0) + 1,
        );
      }
    }

    const now = this.clock.now();
    const results: ShopPromoCodeSummary[] = [];
    const succeededIds: string[] = [];
    const failed: BulkStopShopPromoCodesFailure[] = [];

    for (const promoCodeId of promoCodeIds) {
      const promotion = promotionsById.get(promoCodeId);

      if (!promotion) {
        failed.push({
          id: promoCodeId,
          code: 'NotFound',
          reason: 'Promo code not found',
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
          id: promoCodeId,
          code: 'NotStoppable',
          reason: `This promo code is already ${status}`,
        });
        continue;
      }
      succeededIds.push(promoCodeId);

      results.push(toShopPromoCodeSummary(
        promotion,
        codeByPromotionId.get(promotion.id) ?? '',
        promotion.productScope === PromotionProductScope.ALL
          ? []
          : promotion.products.getItems().map((target) => target.productId),
        now,
        redemptionCountByPromotionId.get(promotion.id) ?? 0,
      ));
    }

    if (succeededIds.length > 0) {
      await entityManager.flush();
    }

    return { results, succeededIds, failed };
  }
}
