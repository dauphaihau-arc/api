import { Controller, Get, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  MarketplaceService,
  type MarketplaceConfigResult
} from './marketplace.service';

@Controller('marketplace')
@SkipThrottle()
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Get('config')
  @Header('Cache-Control', 'public, max-age=300')
  getConfig(): MarketplaceConfigResult {
    return this.marketplaceService.getConfig();
  }
}
