import {
  MARKETPLACE_LANGUAGES,
  MARKETPLACE_LOCALES,
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

  it('includes vi in the marketplace language set', () => {
    expect(MARKETPLACE_LANGUAGES).toEqual(
      expect.arrayContaining(['en', 'la', 'fr', 'vi']),
    );
  });
});
