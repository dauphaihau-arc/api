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
import {
  PromoCodeNotFoundError,
  PromoCodeStopNotAllowedError,
  ShopAccessDeniedError,
  ShopNotFoundError,
} from '../../errors/shop-app.error';
import type { ShopPromoCodeSummary } from '../../shop.types';
import { toShopPromoCodeSummary } from '../../promo-code-summary.mapper';

/**
 * The irreversible stops a seller can apply to a Promo Code. Cancelling
 * retires one that has not started; ending retires one that is currently
 * running. Neither is a deletion: the Promotion, its code identity, its
 * Product Scope, its consumed allowances and its Order references stay in
 * place, and the code is simply never applied or discovered again.
 */
export enum ShopPromoCodeStopAction {
  CANCEL = 'cancel',
  END = 'end',
}

@Injectable()
export class StopShopPromoCodeUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    shopId: string,
    promoCodeId: string,
    action: ShopPromoCodeStopAction,
  ): Promise<ShopPromoCodeSummary> {
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
      {
        id: promoCodeId,
        shop: shopId,
        applicationKind: PromotionApplicationKind.CHECKOUT_DISCOUNT,
      },
      { populate: ['shop', 'products'] },
    );

    if (!promotion) {
      throw new PromoCodeNotFoundError();
    }

    const now = this.clock.now();
    const status = resolvePromotionStatus(promotion, now);

    if (
      (action === ShopPromoCodeStopAction.CANCEL && status !== PromotionStatus.SCHEDULED)
      || (action === ShopPromoCodeStopAction.END && status !== PromotionStatus.ACTIVE)
    ) {
      throw new PromoCodeStopNotAllowedError(action, status);
    }

    if (action === ShopPromoCodeStopAction.CANCEL) {
      promotion.cancelledAt = now;
    }
    else {
      promotion.endedAt = now;
    }

    await entityManager.flush();

    return this.toSummary(entityManager, promotion, now);
  }

  /**
   * The stopped Promo Code keeps its code identity and consumed allowances, so
   * the returned summary already reflects the retained history.
   */
  private async toSummary(
    entityManager: EntityManager,
    promotion: PromotionEntity,
    now: Date,
  ): Promise<ShopPromoCodeSummary> {
    const code = await entityManager.getRepository(PromotionCodeEntity).findOne({
      promotion: promotion.id,
    });
    const redemptionCount = await entityManager.getRepository(PromotionUsageEntity).count({
      promotion: promotion.id,
    });

    return toShopPromoCodeSummary(
      promotion,
      code?.code ?? '',
      promotion.productScope === PromotionProductScope.ALL
        ? []
        : promotion.products.getItems().map((target) => target.productId),
      now,
      redemptionCount,
    );
  }
}
