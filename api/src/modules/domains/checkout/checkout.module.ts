import { MikroOrmModule } from '@mikro-orm/nestjs';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  CHECKOUT_CONFIG,
  buildCheckoutConfig,
} from '~/config/checkout.config';
import { AuthModule } from '../auth/auth.module';
import { CurrentUserEntity } from '../auth/infra/persistence/entities/current-user.entity';
import { CartModule } from '../cart/cart.module';
import { CouponModule } from '../coupon/coupon.module';
import { CouponUsageEntity } from '../coupon/infra/persistence/entities/coupon-usage.entity';
import { OrderModule } from '../order/order.module';
import { ProductModule } from '../product/product.module';
import { ProductEntity } from '../product/infra/persistence/mikro-orm/entities/product.entity';
import { ProductInventoryEntity } from '../product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { ProductVariantEntity } from '../product/infra/persistence/mikro-orm/entities/product-variant.entity';
import { ShopModule } from '../shop/shop.module';
import { ShopEntity } from '../shop/infra/persistence/entities/shop.entity';
import { UserModule } from '../user/user.module';
import { NotificationModule } from '../../shared/notification/notification.module';
import { PaymentModule } from '../../shared/payment/payment.module';
import { QueueModule } from '../../shared/queue/queue.module';
import { StorageModule } from '../../shared/storage/storage.module';
import { CheckoutController } from './api/rest/checkout.controller';
import { MeCheckoutController } from './api/rest/me-checkout.controller';
import { CheckoutStockReservationService } from './app/checkout-stock-reservation.service';
import { CreateCheckoutQuoteService } from './app/create-checkout-quote.service';
import { GuestOrderTrackingTokenService } from './app/guest-order-tracking-token.service';
import { LoadCheckoutQuoteService } from './app/load-checkout-quote.service';
import { CreateCheckoutQuoteForBuyNowUseCase } from './app/use-cases/create-checkout-quote-for-buy-now/create-checkout-quote-for-buy-now.use-case';
import { CreateCheckoutQuoteFromCartUseCase } from './app/use-cases/create-checkout-quote-from-cart/create-checkout-quote-from-cart.use-case';
import { CreateGuestCheckoutQuoteForBuyNowUseCase } from './app/use-cases/create-guest-checkout-quote-for-buy-now/create-guest-checkout-quote-for-buy-now.use-case';
import { CreateGuestCheckoutQuoteFromCartUseCase } from './app/use-cases/create-guest-checkout-quote-from-cart/create-guest-checkout-quote-from-cart.use-case';
import { CreateGuestOrderForBuyNowUseCase } from './app/use-cases/create-guest-order-for-buy-now/create-guest-order-for-buy-now.use-case';
import { CreateGuestOrderFromCartUseCase } from './app/use-cases/create-guest-order-from-cart/create-guest-order-from-cart.use-case';
import { CreateOrderForBuyNowUseCase } from './app/use-cases/create-order-for-buy-now/create-order-for-buy-now.use-case';
import { CreateOrderFromCartUseCase } from './app/use-cases/create-order-from-cart/create-order-from-cart.use-case';
import { GetOrdersByCheckoutSessionUseCase } from './app/use-cases/get-orders-by-checkout-session/get-orders-by-checkout-session.use-case';
import { LookupGuestOrdersUseCase } from './app/use-cases/lookup-guest-orders/lookup-guest-orders.use-case';
import { CheckoutQuoteEntity } from './infra/persistence/entities/checkout-quote.entity';
import { CheckoutQuoteItemEntity } from './infra/persistence/entities/checkout-quote-item.entity';
import { CheckoutStockReservationEntity } from './infra/persistence/entities/checkout-stock-reservation.entity';
import { OrderEntity } from '../order/infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../order/infra/persistence/entities/order-item.entity';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => AuthModule),
    forwardRef(() => OrderModule),
    CartModule,
    CouponModule,
    ProductModule,
    PaymentModule,
    NotificationModule,
    forwardRef(() => QueueModule),
    StorageModule,
    UserModule,
    ShopModule,
    MikroOrmModule.forFeature([
      CheckoutStockReservationEntity,
      CheckoutQuoteEntity,
      CheckoutQuoteItemEntity,
      OrderEntity,
      OrderItemEntity,
      CouponUsageEntity,
      CurrentUserEntity,
      ShopEntity,
      ProductEntity,
      ProductInventoryEntity,
      ProductVariantEntity,
    ]),
  ],
  controllers: [
    CheckoutController,
    MeCheckoutController,
  ],
  providers: [
    {
      provide: CHECKOUT_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildCheckoutConfig(configService),
    },
    CheckoutStockReservationService,
    CreateCheckoutQuoteService,
    LoadCheckoutQuoteService,
    GuestOrderTrackingTokenService,
    CreateGuestCheckoutQuoteFromCartUseCase,
    CreateGuestCheckoutQuoteForBuyNowUseCase,
    CreateGuestOrderFromCartUseCase,
    CreateGuestOrderForBuyNowUseCase,
    CreateCheckoutQuoteFromCartUseCase,
    CreateCheckoutQuoteForBuyNowUseCase,
    CreateOrderFromCartUseCase,
    CreateOrderForBuyNowUseCase,
    GetOrdersByCheckoutSessionUseCase,
    LookupGuestOrdersUseCase,
  ],
  exports: [
    CHECKOUT_CONFIG,
    CheckoutStockReservationService,
    LoadCheckoutQuoteService,
    GuestOrderTrackingTokenService,
    CreateGuestCheckoutQuoteFromCartUseCase,
    CreateGuestCheckoutQuoteForBuyNowUseCase,
    CreateGuestOrderFromCartUseCase,
    CreateGuestOrderForBuyNowUseCase,
    CreateCheckoutQuoteFromCartUseCase,
    CreateCheckoutQuoteForBuyNowUseCase,
    CreateOrderFromCartUseCase,
    CreateOrderForBuyNowUseCase,
    GetOrdersByCheckoutSessionUseCase,
    LookupGuestOrdersUseCase,
  ],
})
export class CheckoutModule {}
