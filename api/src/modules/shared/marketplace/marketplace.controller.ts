import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  MarketplaceService,
  type MarketplaceConfigResult,
} from './marketplace.service';

@Controller('marketplace')
@SkipThrottle()
@ApiTags('Marketplace')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Get('config')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'Get marketplace client configuration' })
  @ApiOkResponse({
    description: 'Marketplace configuration.',
    schema: { type: 'object' },
  })
  getConfig(): MarketplaceConfigResult {
    return this.marketplaceService.getConfig();
  }
}
