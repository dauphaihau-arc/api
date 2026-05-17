import { EntityManager } from '@mikro-orm/postgresql';
import {
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { CouponEntity } from '~/modules/domains/coupon/infra/persistence/entities/coupon.entity';

@Injectable()
export class DeleteShopCouponUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(actor: AuthenticatedUser, shopId: string, couponId: string) {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(CouponEntity);
    const coupon = await repository.findOne(
      { id: couponId },
      { populate: ['shop', 'shop.ownerUser'] }
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

    await entityManager.removeAndFlush(coupon);
  }
}
