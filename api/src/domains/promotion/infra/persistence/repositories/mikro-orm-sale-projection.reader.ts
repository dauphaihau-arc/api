import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { Clock } from '~/platform/time/clock';
import {
  SaleProjectionReader,
  type FindBestSalesForProductsInput,
  type SaleProjection,
  type SaleProjectionTarget,
} from '../../../app/ports/sale-projection.reader';
import { PromotionApplicationKind } from '../../../domain/enums/promotion-application-kind.enum';
import { PromotionBenefitType } from '../../../domain/enums/promotion-benefit-type.enum';
import { PromotionProductScope } from '../../../domain/enums/promotion-product-scope.enum';
import { PromotionEntity } from '../entities/promotion.entity';

@Injectable()
export class MikroOrmSaleProjectionReader extends SaleProjectionReader {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly clock: Clock,
  ) {
    super();
  }

  async findBestSalesForProducts(
    input: FindBestSalesForProductsInput,
  ): Promise<Map<string, SaleProjection>> {
    const bestByProductId = new Map<string, SaleProjection>();

    if (input.targets.length === 0) {
      return bestByProductId;
    }

    const now = input.at ?? this.clock.now();
    const shopIds = [...new Set(input.targets.map((target) => target.shopId))];
    const promotions = await this.entityManager.fork().getRepository(PromotionEntity).find(
      {
        shop: { $in: shopIds },
        applicationKind: PromotionApplicationKind.SALE,
        benefitType: PromotionBenefitType.PERCENTAGE,
        startAt: { $lte: now },
        endAt: { $gt: now },
        cancelledAt: null,
        endedAt: null,
        percentOff: { $gt: 0 },
      },
      { populate: ['products'] },
    );

    for (const promotion of promotions) {
      const percentOff = promotion.percentOff ?? 0;
      const targetedProductIds = this.targetedProductIds(promotion, input.targets);

      for (const productId of targetedProductIds) {
        const current = bestByProductId.get(productId);

        if (!current || percentOff > current.percentOff) {
          bestByProductId.set(productId, { promotionId: promotion.id, percentOff });
        }
      }
    }

    return bestByProductId;
  }

  private targetedProductIds(
    promotion: PromotionEntity,
    targets: SaleProjectionTarget[],
  ): string[] {
    const targetsForShop = targets.filter((target) => target.shopId === promotion.shop.id);

    if (promotion.productScope === PromotionProductScope.ALL) {
      return targetsForShop.map((target) => target.productId);
    }

    const selectedProductIds = new Set(
      promotion.products.getItems().map((target) => target.productId),
    );

    return targetsForShop
      .filter((target) => selectedProductIds.has(target.productId))
      .map((target) => target.productId);
  }
}
