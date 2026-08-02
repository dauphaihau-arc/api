import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CurrentUserEntity } from '../auth/infra/persistence/entities/current-user.entity';
import { ProductShippingDestinationEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-shipping-destination.entity';
import { ProductShippingProfileEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-shipping-profile.entity';
import { CouponPricingService } from './app/services/coupon-pricing.service';
import { CouponEntity } from './infra/persistence/entities/coupon.entity';
import { CouponUsageEntity } from './infra/persistence/entities/coupon-usage.entity';

@Module({
  imports: [
    ConfigModule,
    MikroOrmModule.forFeature([
      CouponEntity,
      CouponUsageEntity,
      CurrentUserEntity,
      ProductShippingProfileEntity,
      ProductShippingDestinationEntity,
    ]),
  ],
  providers: [CouponPricingService],
  exports: [CouponPricingService],
})
export class CouponModule {}
