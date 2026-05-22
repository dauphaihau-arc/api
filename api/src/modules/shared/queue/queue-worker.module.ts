import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { validateAppEnv } from '~/config/app-env.config';
import { buildDatabaseConfig } from '~/config/database.config';
import { OrderModule } from '../../domains/order/order.module';
import { OrderCheckoutOutboxWorkerService } from '../../domains/order/app/order-checkout-outbox-worker.service';
import { QueueModule } from './queue.module';
import { BullMqWorkerService } from './infra/bullmq-worker.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateAppEnv,
    }),
    EventEmitterModule.forRoot(),
    MikroOrmModule.forRoot({
      ...buildDatabaseConfig(process.env),
      autoLoadEntities: true,
      registerRequestContext: false,
    }),
    QueueModule,
    OrderModule,
  ],
  providers: [BullMqWorkerService, OrderCheckoutOutboxWorkerService],
})
export class QueueWorkerModule {}
