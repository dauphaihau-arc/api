import { EntityManager } from '@mikro-orm/postgresql';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { CouponType } from '~/domains/coupon/domain/enums/coupon-type.enum';
import { CouponEntity } from '~/domains/coupon/infra/persistence/entities/coupon.entity';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { dispatchShopProjection } from '../shop-coupon-catalog-projection';

@Injectable()
export class DeleteShopCouponUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly jobDispatcher: JobDispatcher,
  ) {}

  async execute(actor: AuthenticatedUser, shopId: string, couponId: string) {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(CouponEntity);
    const coupon = await repository.findOne(
      { id: couponId },
      { populate: ['shop', 'shop.ownerUser'] },
    );

    if (!coupon || coupon.shop.id !== shopId) {
      throw new NotFoundException('Coupon not found');
    }

    if (
      coupon.shop.ownerUser.id !== actor.userId
      && !actor.roles.includes('admin')
    ) {
      throw new ForbiddenException('You do not own this shop');
    }

    await entityManager.remove(coupon).flush();

    if (
      coupon.isAutoSale
      && coupon.isActive 
      && coupon.type === CouponType.PERCENTAGE
      && coupon.percentOff > 0
    ) {
      await dispatchShopProjection(
        this.jobDispatcher,
        shopId,
        coupon.appliesProductIds.length > 0 ? coupon.appliesProductIds : undefined,
        `coupon-${coupon.id}-delete`,
      );
    }
  }
}
