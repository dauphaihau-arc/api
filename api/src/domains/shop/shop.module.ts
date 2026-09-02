import { MikroOrmModule } from '@mikro-orm/nestjs';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { QueueModule } from '~/integrations/queue/queue.module';
import { CouponEntity } from '../coupon/infra/persistence/entities/coupon.entity';
import { ShopRepository } from './app/ports/shop.repository';
import { ShopAccessService } from './app/services/shop-access.service';
import { BulkDeleteShopCouponsUseCase } from './app/use-cases/bulk-delete-shop-coupons/bulk-delete-shop-coupons.use-case';
import { CreateShopCouponUseCase } from './app/use-cases/create-shop-coupon/create-shop-coupon.use-case';
import { CreateShopUseCase } from './app/use-cases/create-shop/create-shop.use-case';
import { DeleteShopCouponUseCase } from './app/use-cases/delete-shop-coupon/delete-shop-coupon.use-case';
import { GetMyShopUseCase } from './app/use-cases/get-my-shop/get-my-shop.use-case';
import { ListShopCouponsUseCase } from './app/use-cases/list-shop-coupons/list-shop-coupons.use-case';
import { ShopCouponsController } from './api/rest/shop-coupons.controller';
import { ShopController } from './api/rest/shop.controller';
import { MikroOrmShopRepository } from './infra/mikro-orm-shop.repository';
import { ShopEntity } from './infra/persistence/entities/shop.entity';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => AuthModule),
    QueueModule,
    MikroOrmModule.forFeature([ShopEntity, CouponEntity]),
  ],
  controllers: [ShopController, ShopCouponsController],
  providers: [
    {
      provide: ShopRepository,
      useClass: MikroOrmShopRepository,
    },
    ShopAccessService,
    CreateShopUseCase,
    GetMyShopUseCase,
    CreateShopCouponUseCase,
    ListShopCouponsUseCase,
    BulkDeleteShopCouponsUseCase,
    DeleteShopCouponUseCase,
  ],
  exports: [ShopRepository, ShopAccessService, CreateShopUseCase, GetMyShopUseCase],
})
export class ShopModule {}
