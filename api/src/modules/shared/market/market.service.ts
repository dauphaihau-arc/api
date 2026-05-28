import { Injectable } from '@nestjs/common';
import {
  MARKETPLACE_MARKETS,
  type MarketplaceMarket,
} from '~/config/marketplace.config';

export interface MarketConfigResult {
  markets: MarketplaceMarket[];
}

@Injectable()
export class MarketService {
  getConfig(): MarketConfigResult {
    return {
      markets: MARKETPLACE_MARKETS.map((market) => ({
        ...market,
        supportedCurrencies: [...market.supportedCurrencies],
        supportedLocales: [...market.supportedLocales],
      })),
    };
  }
}
