import { EntityManager } from '@mikro-orm/postgresql';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { CouponAppliesTo } from '~/modules/domains/coupon/domain/enums/coupon-applies-to.enum';
import { CouponMinOrderType } from '~/modules/domains/coupon/domain/enums/coupon-min-order-type.enum';
import { CouponType } from '~/modules/domains/coupon/domain/enums/coupon-type.enum';
import { CouponEntity } from '~/modules/domains/coupon/infra/persistence/entities/coupon.entity';
import { ShopEntity } from '../../../infra/persistence/entities/shop.entity';
import type { CreateShopCouponDto } from '../../../api/rest/dto/create-shop-coupon.dto';
import type { ShopCouponSummary } from '../../shop.types';

@Injectable()
export class CreateShopCouponUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(actor: AuthenticatedUser, shopId: string, body: CreateShopCouponDto) {
    const entityManager = this.entityManager.fork();
    const shop = await entityManager.getRepository(ShopEntity).findOne(
      { id: shopId },
      { populate: ['ownerUser'] }
    );

    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    if (shop.ownerUser.id !== actor.userId) {
      throw new ForbiddenException('You do not own this shop');
    }

    if (new Date(body.startDate) > new Date(body.endDate)) {
      throw new BadRequestException('endDate must be after startDate');
    }

    if (body.maxUsesPerUser > body.maxUses) {
      throw new BadRequestException('maxUsesPerUser must be less than or equal to maxUses');
    }

    const existing = await entityManager.getRepository(CouponEntity).findOne({
      shop: shopId,
      code: body.code.toUpperCase(),
    });

    if (existing) {
      throw new BadRequestException('Coupon code already exists');
    }

    const coupon = entityManager.getRepository(CouponEntity).create({
      shop,
      code: body.code.toUpperCase(),
      type: body.type,
      appliesTo: body.appliesTo ?? CouponAppliesTo.ALL,
      appliesProductIds: body.appliesTo === CouponAppliesTo.SPECIFIC
        ? (body.appliesProductIds ?? [])
        : [],
      amountOff: body.type === CouponType.FIXED_AMOUNT ? body.amountOff ?? 0 : 0,
      percentOff: body.type === CouponType.PERCENTAGE ? body.percentOff ?? 0 : 0,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      maxUses: body.maxUses,
      maxUsesPerUser: body.maxUsesPerUser,
      usesCount: 0,
      minOrderType: body.minOrderType ?? CouponMinOrderType.NONE,
      minOrderValue: body.minOrderType === CouponMinOrderType.ORDER_TOTAL
        ? body.minOrderValue ?? 0
        : 0,
      minProducts: body.minOrderType === CouponMinOrderType.NUMBER_OF_PRODUCTS
        ? body.minProducts ?? 0
        : 0,
      isActive: body.isActive ?? true,
      isAutoSale: body.isAutoSale ?? false,
    });

    await entityManager.persistAndFlush(coupon);
    return toShopCouponSummary(coupon);
  }
}

function toShopCouponSummary(coupon: CouponEntity): ShopCouponSummary {
  return {
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
  };
}
