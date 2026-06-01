import { Module } from '@nestjs/common';
import { InternalSentryController } from './internal-sentry.controller';
import { MetricsController } from './metrics.controller';
import { ObservabilityService } from './observability.service';

@Module({
  controllers: [MetricsController, InternalSentryController],
  providers: [ObservabilityService],
  exports: [ObservabilityService],
})
export class ObservabilityModule {}
