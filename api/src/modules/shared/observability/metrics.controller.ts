import { Controller, Get, Header, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ObservabilityService } from './observability.service';

@Controller('metrics')
@SkipThrottle()
export class MetricsController {
  constructor(
    private readonly observabilityService: ObservabilityService
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async getMetrics(@Res() response: Response): Promise<void> {
    response
      .type(this.observabilityService.contentType())
      .send(await this.observabilityService.renderMetrics());
  }
}
