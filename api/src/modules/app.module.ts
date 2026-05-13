import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { GraphQLModule } from '@nestjs/graphql';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { RequestContextModule } from './shared/request-context/request-context.module';
import { InvalidateUserCacheOnUserCreatedListener } from '../common/listeners/invalidate-user-cache-on-user-created.listener';
import { InvalidateUserCacheOnUserUpdatedListener } from '../common/listeners/invalidate-user-cache-on-user-updated.listener';
import { SendWelcomeEmailOnUserCreatedListener } from '../common/listeners/send-welcome-email-on-user-created.listener';
import { validateAppEnv } from '../config/app-env.config';
import { buildDatabaseConfig } from '../config/database.config';
import { AuthModule } from './domains/auth/auth.module';
import { CategoryModule } from './domains/category/category.module';
import { ProductModule } from './domains/product/product.module';
import { ShopModule } from './domains/shop/shop.module';
import { UserModule } from './domains/user/user.module';
import { CacheModule } from './shared/cache/cache.module';
import { HealthModule } from './shared/health/health.module';
import { MailModule } from './shared/mail/mail.module';
import { QueueModule } from './shared/queue/queue.module';
import { RateLimitModule } from './shared/rate-limit/rate-limit.module';
import { StorageModule } from './shared/storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateAppEnv,
    }),

    // ------ shared
    RequestContextModule,
    EventEmitterModule.forRoot(),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      path: '/graphql',
      context: ({ req }) => ({ req }),
    }),
    MikroOrmModule.forRoot({
      ...buildDatabaseConfig(process.env),
      autoLoadEntities: true,
      registerRequestContext: false,
    }),
    MikroOrmModule.forMiddleware(),
    CacheModule,
    MailModule,
    QueueModule,
    RateLimitModule,
    StorageModule,
    HealthModule,

    // ----- domains
    AuthModule,
    UserModule,
    ShopModule,
    CategoryModule,
    ProductModule,
  ],
  providers: [
    InvalidateUserCacheOnUserCreatedListener,
    InvalidateUserCacheOnUserUpdatedListener,
    SendWelcomeEmailOnUserCreatedListener,
  ],
})
export class AppModule {}
