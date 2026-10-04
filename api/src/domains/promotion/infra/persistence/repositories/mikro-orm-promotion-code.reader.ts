import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { Clock } from '~/platform/time/clock';
import {
  PromotionCodeReader,
  type FindActiveCheckoutDiscountsInput,
  type PromotionCodeOffer,
} from '../../../app/ports/promotion-code.reader';
import { PromotionApplicationKind } from '../../../domain/enums/promotion-application-kind.enum';
import { PromotionMinOrderType } from '../../../domain/enums/promotion-min-order-type.enum';
import { PromotionProductScope } from '../../../domain/enums/promotion-product-scope.enum';
import { PromotionVisibility } from '../../../domain/enums/promotion-visibility.enum';
import { PromotionCodeEntity } from '../entities/promotion-code.entity';
import { PromotionEntity } from '../entities/promotion.entity';
import { PromotionUsageEntity } from '../entities/promotion-usage.entity';

@Injectable()
export class MikroOrmPromotionCodeReader extends PromotionCodeReader {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly clock: Clock,
  ) {
    super();
  }

  async findActiveCheckoutDiscounts(
    input: FindActiveCheckoutDiscountsInput,
  ): Promise<PromotionCodeOffer[]> {
    if (input.shopIds.length === 0) {
      return [];
    }

    const now = input.at ?? this.clock.now();
    const codes = await this.entityManager.fork().getRepository(PromotionCodeEntity).find(
      {
        shopId: { $in: input.shopIds },
        promotion: {
          applicationKind: PromotionApplicationKind.CHECKOUT_DISCOUNT,
          startAt: { $lte: now },
          endAt: { $gt: now },
          cancelledAt: null,
          endedAt: null,
        },
      },
      { populate: ['promotion', 'promotion.products'] },
    );

    const promotionIds = codes.map((code) => (code.promotion as PromotionEntity).id);
    const usageCounts = await this.countUsagesByPromotion(promotionIds, {});

    return codes.map((code) => this.toOffer(code, usageCounts));
  }

  async countUsagesByUser(
    promotionIds: string[],
    userId: string,
  ): Promise<Map<string, number>> {
    return this.countUsagesByPromotion(promotionIds, { userId });
  }

  private async countUsagesByPromotion(
    promotionIds: string[],
    filter: { userId?: string },
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();

    if (promotionIds.length === 0) {
      return counts;
    }

    const usages = await this.entityManager.fork().getRepository(PromotionUsageEntity).find({
      promotion: { $in: [...new Set(promotionIds)] },
      ...(filter.userId ? { userId: filter.userId } : {}),
    });

    for (const usage of usages) {
      const promotionId = usage.promotion.id;
      counts.set(promotionId, (counts.get(promotionId) ?? 0) + 1);
    }

    return counts;
  }

  private toOffer(
    code: PromotionCodeEntity,
    usageCounts: Map<string, number>,
  ): PromotionCodeOffer {
    const promotion = code.promotion as PromotionEntity;
    const productIds = promotion.productScope === PromotionProductScope.ALL
      ? []
      : promotion.products.getItems().map((product) => product.productId);

    return {
      promotionId: promotion.id,
      shopId: code.shopId,
      code: code.code,
      benefitType: promotion.benefitType,
      percentOff: promotion.percentOff ?? 0,
      amountOff: promotion.amountOff == null ? 0 : Number(promotion.amountOff),
      currency: promotion.currency,
      visibility: promotion.visibility ?? PromotionVisibility.CODE_ONLY,
      productScope: promotion.productScope,
      productIds,
      minOrderType: promotion.minOrderType ?? PromotionMinOrderType.NONE,
      minOrderValue: promotion.minOrderValue == null ? 0 : Number(promotion.minOrderValue),
      minPurchaseQuantity: promotion.minPurchaseQuantity ?? 0,
      maxRedemptions: promotion.maxRedemptions ?? null,
      maxRedemptionsPerBuyer: promotion.maxRedemptionsPerBuyer ?? null,
      redemptionCount: usageCounts.get(promotion.id) ?? 0,
      startAt: promotion.startAt,
      endAt: promotion.endAt,
      timezone: promotion.timezone,
    };
  }
}
