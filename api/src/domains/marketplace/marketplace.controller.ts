import { Controller, Get, Header } from '@nestjs/common';
import {
  ApiOkResponse, ApiOperation, ApiProperty, ApiTags, 
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { marketplaceErrorResponses } from './marketplace-error-responses';

import {
  MarketplaceService,
  type MarketplaceConfigResult,
} from './marketplace.service';
class MarketplaceMarketResponseDto {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  defaultCurrency!: string;

  @ApiProperty({ type: [String] })
  supportedCurrencies!: string[];

  @ApiProperty()
  defaultLocale!: string;

  @ApiProperty({ type: [String] })
  supportedLocales!: string[];

  @ApiProperty()
  enabled!: boolean;
}

class MarketplaceConfigResponseDto {
  @ApiProperty({ type: [MarketplaceMarketResponseDto] })
  markets!: MarketplaceMarketResponseDto[];
}

@Controller('marketplace')
@SkipThrottle()
@ApiTags('Marketplace')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Get('config')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiErrorResponses(marketplaceErrorResponses.config)
  @ApiOperation({
    summary: 'Get client config',
    description: 'Returns public marketplace configuration for the client.',
  })
  @ApiOkResponse({
    description: 'Marketplace configuration.',
    type: MarketplaceConfigResponseDto,
  })
  getConfig(): MarketplaceConfigResult {
    return this.marketplaceService.getConfig();
  }
}
