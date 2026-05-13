import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  async getHealth() {
    const result = await this.healthService.check();

    if (result.status === 'error') {
      throw new ServiceUnavailableException(result);
    }

    return result;
  }
}
