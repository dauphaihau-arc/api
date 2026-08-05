import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { LoggerModule } from 'nestjs-pino';
import { RequestContextModule } from '~/platform/request-context/request-context.module';
import { InvalidateUserCacheOnUserCreatedListener } from '~/domains/user/listeners/invalidate-user-cache-on-user-created.listener';
import { InvalidateUserCacheOnUserUpdatedListener } from '~/domains/user/listeners/invalidate-user-cache-on-user-updated.listener';
import { SendWelcomeEmailOnUserCreatedListener } from '~/domains/user/listeners/send-welcome-email-on-user-created.listener';
import { buildPinoLoggerParams } from '~/platform/logging/pino-logger.config';
import { validateAppEnv } from '~/platform/config/app-env.config';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import { AuthModule } from '~/domains/auth/auth.module';
import { CartModule } from '~/domains/cart/cart.module';
import { CategoryModule } from '~/domains/category/category.module';
import { CouponModule } from '~/domains/coupon/coupon.module';
import { CheckoutModule } from '~/domains/checkout/checkout.module';
import { OrderModule } from '~/domains/order/order.module';
import { ProductModule } from '~/domains/product/product.module';
import { ShopModule } from '~/domains/shop/shop.module';
import { ChatModule } from '~/domains/chat/chat.module';
import { UserModule } from '~/domains/user/user.module';
import { CacheModule } from '~/integrations/cache/cache.module';
import { HealthModule } from '~/platform/health/health.module';
import { MailModule } from '~/integrations/mail/mail.module';
import { CurrencyModule } from '~/integrations/currency/currency.module';
import { MarketplaceModule } from '~/domains/marketplace/marketplace.module';
import { NotificationModule } from '~/domains/notification/notification.module';
import { ObservabilityModule } from '~/platform/observability/observability.module';
import { JobsModule } from '~/platform/jobs/jobs.module';
import { QueueModule } from '~/integrations/queue/queue.module';
import { RateLimitModule } from '~/integrations/rate-limit/rate-limit.module';
import { StorageModule } from '~/integrations/storage/storage.module';
import { PaymentModule } from '~/integrations/payment/payment.module';
import { SseModule } from '~/platform/sse/sse.module';
import { WsModule } from '~/platform/ws/ws.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateAppEnv,
    }),
    LoggerModule.forRoot(buildPinoLoggerParams('api')),
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
    JobsModule,
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
