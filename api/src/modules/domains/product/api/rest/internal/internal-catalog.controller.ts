import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  CatalogStatus,
  CatalogStatusService,
} from '../../../app/services/catalog-status.service';

@Controller('internal/catalog')
@SkipThrottle()
@ApiExcludeController()
export class InternalCatalogController {
  constructor(
    private readonly catalogStatusService: CatalogStatusService,
  ) {}

  @Get('status')
  async getStatus(): Promise<CatalogStatus> {
    return this.catalogStatusService.getStatus();
  }
}
