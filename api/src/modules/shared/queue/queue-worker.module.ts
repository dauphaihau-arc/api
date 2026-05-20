import { Module } from '@nestjs/common';
import { OrderModule } from '../../domains/order/order.module';
import { OrderCheckoutOutboxWorkerService } from '../../domains/order/app/order-checkout-outbox-worker.service';
import { QueueModule } from './queue.module';
import { BullMqWorkerService } from './infra/bullmq-worker.service';

@Module({
  imports: [QueueModule, OrderModule],
  providers: [BullMqWorkerService, OrderCheckoutOutboxWorkerService],
})
export class QueueWorkerModule {}
