import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { buildPinoLoggerParams } from '~/platform/logging/pino-logger.config';
import { validateAppEnv } from '~/platform/config/app-env.config';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import { OrderModule } from '~/domains/order/order.module';
import { CurrencyModule } from '~/integrations/currency/currency.module';
import { OrderCheckoutOutboxWorkerService } from '~/domains/order/app/order-checkout-outbox-worker.service';
import { QueueModule } from './queue.module';
import { BullMqWorkerService } from './infra/bullmq-worker.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateAppEnv,
    }),
    LoggerModule.forRoot(buildPinoLoggerParams('worker')),
    EventEmitterModule.forRoot(),
    MikroOrmModule.forRoot({
      ...buildDatabaseConfig(process.env),
      autoLoadEntities: true,
      registerRequestContext: false,
    }),
    QueueModule,
    CurrencyModule,
    OrderModule,
  ],
  providers: [
    BullMqWorkerService,
    OrderCheckoutOutboxWorkerService,
  ],
})
export class QueueWorkerModule {}
