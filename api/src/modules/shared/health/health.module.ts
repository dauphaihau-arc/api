import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { QueueModule } from '../queue/queue.module';
import { StorageModule } from '../storage/storage.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [MikroOrmModule, StorageModule, QueueModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
