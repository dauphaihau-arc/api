import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { FinanceOutboxWorkerService } from '~/domains/finance/app/services/finance-outbox-worker.service';
import { FinanceModule } from '~/domains/finance/finance.module';
import { OrderCheckoutOutboxWorkerService } from '~/domains/order/app/services/order-checkout-outbox-worker.service';
import { OrderInventoryOutboxWorkerService } from '~/domains/order/app/services/order-inventory-outbox-worker.service';
import { OrderModule } from '~/domains/order/order.module';
import { QueueModule } from '~/integrations/queue/queue.module';
import { BullMqWorkerService } from '~/integrations/queue/infra/bullmq-worker.service';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import { validateAppEnv } from '~/platform/config/app-env.config';
import { buildPinoLoggerParams } from '~/platform/logging/pino-logger.config';
import { TimeModule } from '~/platform/time/time.module';
import { JobsModule } from './jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateAppEnv,
    }),
    LoggerModule.forRoot(buildPinoLoggerParams('worker')),
    TimeModule,
    EventEmitterModule.forRoot(),
    MikroOrmModule.forRoot({
      ...buildDatabaseConfig(process.env),
      autoLoadEntities: true,
      registerRequestContext: false,
    }),
    QueueModule,
    JobsModule,
    OrderModule,
    FinanceModule,
  ],
  providers: [
    BullMqWorkerService,
    OrderCheckoutOutboxWorkerService,
    OrderInventoryOutboxWorkerService,
    FinanceOutboxWorkerService,
  ],
})
export class JobsWorkerModule {}
