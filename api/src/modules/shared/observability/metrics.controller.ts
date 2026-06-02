import { Controller, Get, Header, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ObservabilityService } from './observability.service';

@Controller('metrics')
@SkipThrottle()
@ApiTags('Observability')
export class MetricsController {
  constructor(
    private readonly observabilityService: ObservabilityService
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Get Prometheus metrics' })
  @ApiProduces('text/plain')
  @ApiOkResponse({
    description: 'Prometheus metrics payload.',
    schema: { type: 'string' },
  })
  async getMetrics(@Res() response: Response): Promise<void> {
    response
      .type(this.observabilityService.contentType())
      .send(await this.observabilityService.renderMetrics());
  }
}
