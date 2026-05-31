import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { ObservabilityService } from './observability.service';

@Module({
  controllers: [MetricsController],
  providers: [ObservabilityService],
  exports: [ObservabilityService],
})
export class ObservabilityModule {}
