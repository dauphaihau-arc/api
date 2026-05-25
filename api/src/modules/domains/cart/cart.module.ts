import { MikroOrmModule } from '@mikro-orm/nestjs';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CART_CONFIG, buildCartConfig } from '~/config/cart.config';
import { StorageModule } from '../../shared/storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { CouponModule } from '../coupon/coupon.module';
import { CurrentUserEntity } from '../auth/infra/persistence/entities/current-user.entity';
import { ProductImageEntity } from '../product/infra/persistence/entities/product-image.entity';
import { ProductInventoryEntity } from '../product/infra/persistence/entities/product-inventory.entity';
import { ProductEntity } from '../product/infra/persistence/entities/product.entity';
import { ProductVariantEntity } from '../product/infra/persistence/entities/product-variant.entity';
import { ShopEntity } from '../shop/infra/persistence/entities/shop.entity';
import { CartRepository } from './app/ports/cart.repository';
import { AddCartItemUseCase } from './app/use-cases/add-cart-item/add-cart-item.use-case';
import { GetCartUseCase } from './app/use-cases/get-cart/get-cart.use-case';
import { MergeGuestCartUseCase } from './app/use-cases/merge-guest-cart/merge-guest-cart.use-case';
import { RemoveCartItemUseCase } from './app/use-cases/remove-cart-item/remove-cart-item.use-case';
import { UpdateCartItemUseCase } from './app/use-cases/update-cart-item/update-cart-item.use-case';
import { CartController } from './api/rest/cart.controller';
import { GuestCartSessionService } from './api/rest/guest-cart-session.service';
import { MikroOrmCartRepository } from './infra/mikro-orm-cart.repository';
import { CartEntity } from './infra/persistence/entities/cart.entity';
import { CartItemEntity } from './infra/persistence/entities/cart-item.entity';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => AuthModule),
    CouponModule,
    StorageModule,
    MikroOrmModule.forFeature([
      CartEntity,
      CartItemEntity,
      CurrentUserEntity,
      ShopEntity,
      ProductEntity,
      ProductImageEntity,
      ProductInventoryEntity,
      ProductVariantEntity,
    ]),
  ],
  controllers: [CartController],
  providers: [
    {
      provide: CART_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => buildCartConfig(configService),
    },
    {
      provide: CartRepository,
      useClass: MikroOrmCartRepository,
    },
    GetCartUseCase,
    MergeGuestCartUseCase,
    AddCartItemUseCase,
    UpdateCartItemUseCase,
    RemoveCartItemUseCase,
    GuestCartSessionService,
  ],
  exports: [
    CartRepository,
    GetCartUseCase,
    MergeGuestCartUseCase,
    AddCartItemUseCase,
    UpdateCartItemUseCase,
    RemoveCartItemUseCase,
    GuestCartSessionService,
  ],
})
export class CartModule {}
