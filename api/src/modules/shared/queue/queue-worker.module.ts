import { Module } from '@nestjs/common';
import { QueueModule } from './queue.module';
import { BullMqWorkerService } from './infra/bullmq-worker.service';

@Module({
  imports: [QueueModule],
  providers: [BullMqWorkerService],
})
export class QueueWorkerModule {}
