import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { OrderCheckoutOutboxWorkerService } from '~/domains/order/app/services/order-checkout-outbox-worker.service';
import { OrderModule } from '~/domains/order/order.module';
import { QueueModule } from '~/integrations/queue/queue.module';
import { BullMqWorkerService } from '~/integrations/queue/infra/bullmq-worker.service';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import { validateAppEnv } from '~/platform/config/app-env.config';
import { buildPinoLoggerParams } from '~/platform/logging/pino-logger.config';
import { JobsModule } from './jobs.module';

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
    JobsModule,
    OrderModule,
  ],
  providers: [
    BullMqWorkerService,
    OrderCheckoutOutboxWorkerService,
  ],
})
export class JobsWorkerModule {}
