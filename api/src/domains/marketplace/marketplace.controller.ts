import { Controller, Get, Header } from '@nestjs/common';
import {
  ApiOkResponse, ApiOperation, ApiProperty, ApiTags, 
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  MARKETPLACE_CURRENCIES,
  MARKETPLACE_LOCALES,
  MARKETPLACE_REGIONS,
  type MarketplaceCurrency,
  type MarketplaceLocale,
  type MarketplaceRegion,
} from '~/platform/config/marketplace.config';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { marketplaceErrorResponses } from './marketplace-error-responses';

import {
  MarketplaceService,
  type MarketplaceConfigResult,
} from './marketplace.service';
class MarketplaceMarketResponseDto {
  @ApiProperty()
  code!: string;

  @ApiProperty({ enum: MARKETPLACE_REGIONS })
  name!: MarketplaceRegion;

  @ApiProperty({ enum: MARKETPLACE_CURRENCIES })
  defaultCurrency!: MarketplaceCurrency;

  @ApiProperty({ enum: MARKETPLACE_CURRENCIES, isArray: true })
  supportedCurrencies!: MarketplaceCurrency[];

  @ApiProperty({ enum: MARKETPLACE_LOCALES })
  defaultLocale!: MarketplaceLocale;

  @ApiProperty({ enum: MARKETPLACE_LOCALES, isArray: true })
  supportedLocales!: MarketplaceLocale[];

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
