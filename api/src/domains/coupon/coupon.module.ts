import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CurrencyModule } from '~/integrations/currency/currency.module';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { PromotionModule } from '../promotion/promotion.module';
import { CouponPricingService } from './app/services/coupon-pricing.service';
import { CouponPresentmentService } from './app/services/coupon-presentment.service';
import { CouponRepository } from './app/ports/coupon.repository';
import { CouponAutoSaleProjectionReader } from './app/ports/coupon-auto-sale-projection.reader';
import { CouponEntity } from './infra/persistence/entities/coupon.entity';
import { CouponUsageEntity } from './infra/persistence/entities/coupon-usage.entity';
import { MikroOrmCouponAutoSaleProjectionReader } from './infra/persistence/repositories/mikro-orm-coupon-auto-sale-projection.reader';
import { MikroOrmCouponRepository } from './infra/persistence/repositories/mikro-orm-coupon.repository';

@Module({
  imports: [
    ConfigModule,
    CurrencyModule,
    PromotionModule,
    MikroOrmModule.forFeature([
      CouponEntity,
      CouponUsageEntity,
      UserEntity,
    ]),
  ],
  providers: [
    CouponPricingService,
    CouponPresentmentService,
    MikroOrmCouponRepository,
    {
      provide: CouponRepository,
      useExisting: MikroOrmCouponRepository,
    },
    MikroOrmCouponAutoSaleProjectionReader,
    {
      provide: CouponAutoSaleProjectionReader,
      useExisting: MikroOrmCouponAutoSaleProjectionReader,
    },
  ],
  exports: [CouponPricingService, CouponAutoSaleProjectionReader],
})
export class CouponModule {}
