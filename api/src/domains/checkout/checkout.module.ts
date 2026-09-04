import { MikroOrmModule } from '@mikro-orm/nestjs';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  CHECKOUT_CONFIG,
  buildCheckoutConfig,
} from '~/platform/config/checkout.config';
import {
  INVENTORY_RESERVATION_CONFIG,
  buildInventoryReservationConfig,
} from '~/platform/config/inventory-reservation.config';
import { AuthModule } from '../auth/auth.module';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
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
import { NotificationModule } from '~/domains/notification/notification.module';
import { PaymentModule } from '~/integrations/payment/payment.module';
import { QueueModule } from '~/integrations/queue/queue.module';
import { StorageModule } from '~/integrations/storage/storage.module';
import { CheckoutController } from './api/rest/checkout.controller';
import { MeCheckoutController } from './api/rest/me-checkout.controller';
import { CheckoutInventoryQueryRepository } from './app/ports/checkout-inventory-query.repository';
import { CheckoutQuoteRepository } from './app/ports/checkout-quote.repository';
import { CheckoutStockReservationPort } from './app/ports/checkout-stock-reservation.port';
import { RemoteInventoryReservationClient } from './app/ports/remote-inventory-reservation.client';
import { CheckoutStockReservationService } from './app/services/checkout-stock-reservation.service';
import { CreateCheckoutQuoteService } from './app/services/create-checkout-quote.service';
import { GuestOrderTrackingTokenService } from './app/services/guest-order-tracking-token.service';
import { LoadCheckoutQuoteService } from './app/services/load-checkout-quote.service';
import { RemoteAwareCheckoutStockReservationService } from './app/services/remote-aware-checkout-stock-reservation.service';
import { CreateCheckoutQuoteForBuyNowUseCase } from './app/use-cases/create-checkout-quote-for-buy-now/create-checkout-quote-for-buy-now.use-case';
import { CreateCheckoutQuoteFromCartUseCase } from './app/use-cases/create-checkout-quote-from-cart/create-checkout-quote-from-cart.use-case';
import { CreateGuestCheckoutQuoteForBuyNowUseCase } from './app/use-cases/create-guest-checkout-quote-for-buy-now/create-guest-checkout-quote-for-buy-now.use-case';
import { CreateGuestCheckoutQuoteFromCartUseCase } from './app/use-cases/create-guest-checkout-quote-from-cart/create-guest-checkout-quote-from-cart.use-case';
import { CreateGuestOrderForBuyNowUseCase } from './app/use-cases/create-guest-order-for-buy-now/create-guest-order-for-buy-now.use-case';
import { CreateGuestOrderFromCartUseCase } from './app/use-cases/create-guest-order-from-cart/create-guest-order-from-cart.use-case';
import { CreateOrderForBuyNowUseCase } from './app/use-cases/create-order-for-buy-now/create-order-for-buy-now.use-case';
import { CreateOrderFromCartUseCase } from './app/use-cases/create-order-from-cart/create-order-from-cart.use-case';
import { GetOrdersByCheckoutSessionUseCase } from './app/use-cases/get-orders-by-checkout-session/get-orders-by-checkout-session.use-case';
import { GetCheckoutSessionReadinessUseCase } from './app/use-cases/get-checkout-session-readiness/get-checkout-session-readiness.use-case';
import { LookupGuestOrdersUseCase } from './app/use-cases/lookup-guest-orders/lookup-guest-orders.use-case';
import { CheckoutQuoteEntity } from './infra/persistence/entities/checkout-quote.entity';
import { CheckoutQuoteItemEntity } from './infra/persistence/entities/checkout-quote-item.entity';
import { CheckoutStockReservationEntity } from './infra/persistence/entities/checkout-stock-reservation.entity';
import { MikroOrmCheckoutInventoryQueryRepository } from './infra/persistence/repositories/mikro-orm-checkout-inventory-query.repository';
import { MikroOrmCheckoutQuoteRepository } from './infra/persistence/repositories/mikro-orm-checkout-quote.repository';
import {
  FETCH,
  HttpRemoteInventoryReservationClient,
} from './infra/remote/http-remote-inventory-reservation.client';
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
      UserEntity,
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
    {
      provide: INVENTORY_RESERVATION_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildInventoryReservationConfig(configService),
    },
    {
      provide: CheckoutQuoteRepository,
      useClass: MikroOrmCheckoutQuoteRepository,
    },
    {
      provide: CheckoutInventoryQueryRepository,
      useClass: MikroOrmCheckoutInventoryQueryRepository,
    },
    CheckoutStockReservationService,
    RemoteAwareCheckoutStockReservationService,
    {
      provide: CheckoutStockReservationPort,
      useExisting: RemoteAwareCheckoutStockReservationService,
    },
    {
      provide: FETCH,
      useValue: fetch,
    },
    {
      provide: RemoteInventoryReservationClient,
      useClass: HttpRemoteInventoryReservationClient,
    },
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
    GetCheckoutSessionReadinessUseCase,
    LookupGuestOrdersUseCase,
  ],
  exports: [
    CHECKOUT_CONFIG,
    INVENTORY_RESERVATION_CONFIG,
    CheckoutStockReservationPort,
    RemoteInventoryReservationClient,
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
    GetCheckoutSessionReadinessUseCase,
    LookupGuestOrdersUseCase,
  ],
})
export class CheckoutModule {}
