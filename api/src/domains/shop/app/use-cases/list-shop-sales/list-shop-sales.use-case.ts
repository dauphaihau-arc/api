import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { PromotionApplicationKind } from '~/domains/promotion/domain/enums/promotion-application-kind.enum';
import { PromotionEntity } from '~/domains/promotion/infra/persistence/entities/promotion.entity';
import { Clock } from '~/platform/time/clock';
import { ShopEntity } from '../../../infra/persistence/entities/shop.entity';
import { ShopAccessDeniedError, ShopNotFoundError } from '../../errors/shop-app.error';
import type { ListShopSalesQueryDto } from '../../../api/rest/dto/list-shop-sales.query.dto';
import type { ShopSaleListResult } from '../../shop.types';
import { toShopSaleSummary } from '../../sale-summary';
import { loadProductReferences, selectProductReferences } from '../../product-reference';

@Injectable()
export class ListShopSalesUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly clock: Clock,
  ) {}

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
      populate: ['shop', 'products'],
    });

    const now = this.clock.now();
    const productIds = promotions.flatMap((promotion) =>
      promotion.products.getItems().map((target) => target.productId));
    const productReferences = await loadProductReferences(entityManager, productIds);

    return {
      results: promotions.map((promotion) => toShopSaleSummary(
        promotion,
        selectProductReferences(
          promotion.products.getItems().map((target) => target.productId),
          productReferences,
        ),
        now,
      )),
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(totalResults / query.limit)),
      totalResults,
    };
  }
}
