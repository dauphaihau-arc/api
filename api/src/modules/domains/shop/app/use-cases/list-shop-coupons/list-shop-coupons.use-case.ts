import { EntityManager } from '@mikro-orm/postgresql';
import {
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { CouponEntity } from '~/modules/domains/coupon/infra/persistence/entities/coupon.entity';
import { ShopEntity } from '../../../infra/persistence/entities/shop.entity';
import type { ListShopCouponsQueryDto } from '../../../api/rest/dto/list-shop-coupons.query.dto';
import type { ShopCouponListResult } from '../../shop.types';

@Injectable()
export class ListShopCouponsUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(
    actor: AuthenticatedUser,
    shopId: string,
    query: ListShopCouponsQueryDto
  ): Promise<ShopCouponListResult> {
    const entityManager = this.entityManager.fork();
    const shop = await entityManager.getRepository(ShopEntity).findOne(
      { id: shopId },
      { populate: ['ownerUser'] }
    );

    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    if (
      shop.ownerUser.id !== actor.userId
      && !actor.roles.includes('admin')
    ) {
      throw new ForbiddenException('You do not own this shop');
    }

    const baseWhere: Record<string, unknown> = { shop: shopId };

    if (query.code) {
      baseWhere.code = { $ilike: `%${query.code}%` };
    }

    if (query.activeFrom || query.activeTo) {
      if (query.activeFrom) {
        baseWhere.startDate = { $gte: query.activeFrom };
      }

      if (query.activeTo) {
        baseWhere.endDate = { $lte: query.activeTo };
      }
    }

    const repository = entityManager.getRepository(CouponEntity);
    const where = query.is_auto_sale !== undefined
      ? { ...baseWhere, isAutoSale: query.is_auto_sale }
      : baseWhere;
    const [[results, totalResults], allCount, promoCodeCount, saleCount] = await Promise.all([
      repository.findAndCount(where, {
        orderBy: { createdAt: 'desc' },
        offset: (query.page - 1) * query.limit,
        limit: query.limit,
      }),
      repository.count(baseWhere),
      repository.count({ ...baseWhere, isAutoSale: false }),
      repository.count({ ...baseWhere, isAutoSale: true }),
    ]);

    return {
      results: results.map((coupon) => ({
        id: coupon.id,
        shopId: coupon.shop.id,
        code: coupon.code,
        type: coupon.type,
        appliesTo: coupon.appliesTo,
        appliesProductIds: coupon.appliesProductIds,
        amountOff: Number(coupon.amountOff),
        percentOff: coupon.percentOff,
        startDate: coupon.startDate,
        endDate: coupon.endDate,
        maxUses: coupon.maxUses,
        maxUsesPerUser: coupon.maxUsesPerUser,
        usesCount: coupon.usesCount,
        minOrderType: coupon.minOrderType,
        minOrderValue: Number(coupon.minOrderValue),
        minProducts: coupon.minProducts,
        isActive: coupon.isActive,
        isAutoSale: coupon.isAutoSale,
        createdAt: coupon.createdAt,
        updatedAt: coupon.updatedAt,
      })),
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(totalResults / query.limit)),
      totalResults,
      typeCounts: {
        all: allCount,
        promo_code: promoCodeCount,
        sale: saleCount,
      },
    };
  }
}
