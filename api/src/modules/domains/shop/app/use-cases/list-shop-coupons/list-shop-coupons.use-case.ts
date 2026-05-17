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

    const where: Record<string, unknown> = { shop: shopId };

    if (query.code) {
      where.code = { $ilike: `%${query.code}%` };
    }

    if (query.is_auto_sale !== undefined) {
      where.isAutoSale = query.is_auto_sale;
    }

    const repository = entityManager.getRepository(CouponEntity);
    const [results, totalResults] = await repository.findAndCount(where, {
      orderBy: { createdAt: 'desc' },
      offset: (query.page - 1) * query.limit,
      limit: query.limit,
    });

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
    };
  }
}
