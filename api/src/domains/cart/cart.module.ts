import { MikroOrmModule } from '@mikro-orm/nestjs';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CART_CONFIG, buildCartConfig } from '~/platform/config/cart.config';
import { CHECKOUT_CONFIG, buildCheckoutConfig } from '~/platform/config/checkout.config';
import { StorageModule } from '~/integrations/storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { CouponModule } from '../coupon/coupon.module';
import { ProductModule } from '../product/product.module';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { ProductImageEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-image.entity';
import { ProductInventoryEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ProductVariantEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-variant.entity';
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
    ProductModule,
    StorageModule,
    MikroOrmModule.forFeature([
      CartEntity,
      CartItemEntity,
      UserEntity,
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
      provide: CHECKOUT_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => buildCheckoutConfig(configService),
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
