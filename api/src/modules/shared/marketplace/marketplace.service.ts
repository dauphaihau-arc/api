import { Injectable } from '@nestjs/common';
import {
  MARKETPLACE_MARKETS,
  type MarketplaceMarket,
} from '~/config/marketplace.config';

export interface MarketplaceConfigResult {
  markets: MarketplaceMarket[];
}

@Injectable()
export class MarketplaceService {
  getConfig(): MarketplaceConfigResult {
    return {
      markets: MARKETPLACE_MARKETS.map((market) => ({
        ...market,
        supportedCurrencies: [...market.supportedCurrencies],
        supportedLocales: [...market.supportedLocales],
      })),
    };
  }
}
