import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ProductModule } from '~/domains/product/product.module';
import { QueueModule } from '~/integrations/queue/queue.module';
import { StorageModule } from '~/integrations/storage/storage.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [MikroOrmModule, StorageModule, QueueModule, ProductModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
