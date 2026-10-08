import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { PromotionApplicationKind } from '~/domains/promotion/domain/enums/promotion-application-kind.enum';
import { PromotionCodeEntity } from '~/domains/promotion/infra/persistence/entities/promotion-code.entity';
import { PromotionEntity } from '~/domains/promotion/infra/persistence/entities/promotion.entity';
import { PromotionUsageEntity } from '~/domains/promotion/infra/persistence/entities/promotion-usage.entity';
import { Clock } from '~/platform/time/clock';
import { ShopEntity } from '../../../infra/persistence/entities/shop.entity';
import { ShopAccessDeniedError, ShopNotFoundError } from '../../errors/shop-app.error';
import type { ListShopPromoCodesQueryDto } from '../../../api/rest/dto/list-shop-promo-codes.query.dto';
import type { ShopPromoCodeListResult } from '../../shop.types';
import { toShopPromoCodeSummary } from '../../promo-code-summary.mapper';
import { loadProductReferences, selectProductReferences } from '../../product-reference';

@Injectable()
export class ListShopPromoCodesUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    shopId: string,
    query: ListShopPromoCodesQueryDto,
  ): Promise<ShopPromoCodeListResult> {
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

    const repository = entityManager.getRepository(PromotionEntity);
    const where = {
      shop: shopId,
      applicationKind: PromotionApplicationKind.CHECKOUT_DISCOUNT,
    };

    const [promotions, totalResults] = await repository.findAndCount(where, {
      orderBy: { createdAt: 'desc' },
      offset: (query.page - 1) * query.limit,
      limit: query.limit,
      populate: ['shop', 'products'],
    });

    const promotionIds = promotions.map((promotion) => promotion.id);
    const codes = promotionIds.length > 0
      ? await entityManager.getRepository(PromotionCodeEntity).find(
        { promotion: { $in: promotionIds } },
        { populate: ['promotion'] },
      )
      : [];

    const codeByPromotionId = new Map<string, PromotionCodeEntity>();
    for (const code of codes) {
      codeByPromotionId.set(code.promotion.id, code);
    }

    const usages = promotionIds.length > 0
      ? await entityManager.getRepository(PromotionUsageEntity).find({
        promotion: { $in: promotionIds },
      })
      : [];
    const redemptionCountByPromotionId = new Map<string, number>();

    for (const usage of usages) {
      const promotionId = usage.promotion.id;
      redemptionCountByPromotionId.set(
        promotionId,
        (redemptionCountByPromotionId.get(promotionId) ?? 0) + 1,
      );
    }

    const now = this.clock.now();
    const referencesById = await loadProductReferences(
      entityManager,
      promotions.flatMap((promotion) => promotion.products.getItems().map((target) => target.productId)),
    );

    return {
      results: promotions.map((promotion) => {
        const code = codeByPromotionId.get(promotion.id);
        const productIds = promotion.products.getItems().map((target) => target.productId);

        return toShopPromoCodeSummary(
          promotion,
          code?.code ?? '',
          selectProductReferences(productIds, referencesById),
          now,
          redemptionCountByPromotionId.get(promotion.id) ?? 0,
        );
      }),
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(totalResults / query.limit)),
      totalResults,
    };
  }
}
