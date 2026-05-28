import { Controller, Get, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { MarketService, type MarketConfigResult } from './market.service';

@Controller('market')
@SkipThrottle()
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get('config')
  @Header('Cache-Control', 'public, max-age=300')
  getConfig(): MarketConfigResult {
    return this.marketService.getConfig();
  }
}
