import {
  MARKETPLACE_LOCALES,
  STOREFRONT_LANGUAGES,
  type MarketplaceMarket,
} from '~/platform/config/marketplace.config';
import { MarketplaceService } from './marketplace.service';

describe('MarketplaceService', () => {
  const service = new MarketplaceService();

  function findMarket(markets: MarketplaceMarket[], code: string) {
    const market = markets.find((candidate) => candidate.code === code);

    expect(market).toBeDefined();

    return market!;
  }

  it('reports supported locales for the United States and Vietnam markets', () => {
    const { markets } = service.getConfig();
    const unitedStates = findMarket(markets, 'US');
    const vietnam = findMarket(markets, 'VN');

    expect(unitedStates.supportedLocales).toEqual(['en-US', 'vi-US']);
    expect(vietnam.supportedLocales).toEqual(['vi-VN', 'en-VN']);
    expect(MARKETPLACE_LOCALES).toEqual(
      expect.arrayContaining(['en-US', 'vi-US', 'vi-VN', 'en-VN']),
    );
  });

  it('reports only the Storefront Languages', () => {
    expect(STOREFRONT_LANGUAGES).toEqual(['en', 'vi']);
  });
});
