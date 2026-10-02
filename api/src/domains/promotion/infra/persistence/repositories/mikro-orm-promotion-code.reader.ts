import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { Clock } from '~/platform/time/clock';
import {
  PromotionCodeReader,
  type FindActiveCheckoutDiscountsInput,
  type PromotionCodeOffer,
} from '../../../app/ports/promotion-code.reader';
import { PromotionApplicationKind } from '../../../domain/enums/promotion-application-kind.enum';
import { PromotionProductScope } from '../../../domain/enums/promotion-product-scope.enum';
import { PromotionVisibility } from '../../../domain/enums/promotion-visibility.enum';
import { PromotionCodeEntity } from '../entities/promotion-code.entity';
import { PromotionEntity } from '../entities/promotion.entity';

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

    return codes.map((code) => this.toOffer(code));
  }

  private toOffer(code: PromotionCodeEntity): PromotionCodeOffer {
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
      startAt: promotion.startAt,
      endAt: promotion.endAt,
      timezone: promotion.timezone,
    };
  }
}
