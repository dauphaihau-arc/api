import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { PromotionApplicationKind } from '~/domains/promotion/domain/enums/promotion-application-kind.enum';
import { resolvePromotionStatus } from '~/domains/promotion/domain/promotion-lifecycle';
import { PromotionEntity } from '~/domains/promotion/infra/persistence/entities/promotion.entity';
import { ShopEntity } from '../../../infra/persistence/entities/shop.entity';
import { ShopAccessDeniedError, ShopNotFoundError } from '../../errors/shop-app.error';
import type { ListShopSalesQueryDto } from '../../../api/rest/dto/list-shop-sales.query.dto';
import type { ShopSaleListResult } from '../../shop.types';

@Injectable()
export class ListShopSalesUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(
    actor: AuthenticatedUser,
    shopId: string,
    query: ListShopSalesQueryDto,
  ): Promise<ShopSaleListResult> {
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
      applicationKind: PromotionApplicationKind.SALE,
    };

    const [promotions, totalResults] = await repository.findAndCount(where, {
      orderBy: { createdAt: 'desc' },
      offset: (query.page - 1) * query.limit,
      limit: query.limit,
      populate: ['products'],
    });

    const now = new Date();

    return {
      results: promotions.map((promotion) => ({
        id: promotion.id,
        shopId: shop.id,
        name: promotion.name,
        percentOff: promotion.percentOff ?? 0,
        productScope: promotion.productScope,
        productIds: promotion.products.getItems().map((target) => target.productId),
        currency: promotion.currency,
        startAt: promotion.startAt,
        endAt: promotion.endAt,
        timezone: promotion.timezone,
        status: resolvePromotionStatus(promotion, now),
        cancelledAt: promotion.cancelledAt ?? null,
        endedAt: promotion.endedAt ?? null,
        createdAt: promotion.createdAt,
        updatedAt: promotion.updatedAt,
      })),
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(totalResults / query.limit)),
      totalResults,
    };
  }
}
