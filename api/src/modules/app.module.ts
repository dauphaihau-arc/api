import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { LoggerModule } from 'nestjs-pino';
import { RequestContextModule } from './shared/request-context/request-context.module';
import { InvalidateUserCacheOnUserCreatedListener } from '../common/listeners/invalidate-user-cache-on-user-created.listener';
import { InvalidateUserCacheOnUserUpdatedListener } from '../common/listeners/invalidate-user-cache-on-user-updated.listener';
import { SendWelcomeEmailOnUserCreatedListener } from '../common/listeners/send-welcome-email-on-user-created.listener';
import { buildPinoLoggerParams } from '../common/logging/pino-logger.config';
import { validateAppEnv } from '../config/app-env.config';
import { buildDatabaseConfig } from '../config/database.config';
import { AuthModule } from './domains/auth/auth.module';
import { CartModule } from './domains/cart/cart.module';
import { CategoryModule } from './domains/category/category.module';
import { CouponModule } from './domains/coupon/coupon.module';
import { CheckoutModule } from './domains/checkout/checkout.module';
import { OrderModule } from './domains/order/order.module';
import { ProductModule } from './domains/product/product.module';
import { ShopModule } from './domains/shop/shop.module';
import { ChatModule } from './domains/chat/chat.module';
import { UserModule } from './domains/user/user.module';
import { CacheModule } from './shared/cache/cache.module';
import { HealthModule } from './shared/health/health.module';
import { MailModule } from './shared/mail/mail.module';
import { CurrencyModule } from './shared/currency/currency.module';
import { MarketplaceModule } from './shared/marketplace/marketplace.module';
import { NotificationModule } from './shared/notification/notification.module';
import { ObservabilityModule } from './shared/observability/observability.module';
import { QueueModule } from './shared/queue/queue.module';
import { RateLimitModule } from './shared/rate-limit/rate-limit.module';
import { StorageModule } from './shared/storage/storage.module';
import { PaymentModule } from './shared/payment/payment.module';
import { SseModule } from './shared/sse/sse.module';
import { WsModule } from './shared/ws/ws.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateAppEnv,
    }),
    LoggerModule.forRoot(buildPinoLoggerParams('api')),

    // ------ shared
    RequestContextModule,
    EventEmitterModule.forRoot(),
    MikroOrmModule.forRoot({
      ...buildDatabaseConfig(process.env),
      autoLoadEntities: true,
      registerRequestContext: false,
    }),
    MikroOrmModule.forMiddleware(),
    CacheModule,
    CurrencyModule,
    MailModule,
    MarketplaceModule,
    NotificationModule,
    ObservabilityModule,
    PaymentModule,
    QueueModule,
    RateLimitModule,
    SseModule,
    WsModule,
    StorageModule,
    HealthModule,

    // ----- domains
    AuthModule,
    UserModule,
    ShopModule,
    CategoryModule,
    ProductModule,
    CouponModule,
    CartModule,
    CheckoutModule,
    OrderModule,
    ChatModule,
  ],
  providers: [
    InvalidateUserCacheOnUserCreatedListener,
    InvalidateUserCacheOnUserUpdatedListener,
    SendWelcomeEmailOnUserCreatedListener,
  ],
})
export class AppModule {}
