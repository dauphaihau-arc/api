import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MarketplaceController } from './marketplace.controller';
import type { MarketplaceService } from './marketplace.service';

describe('MarketplaceController', () => {
  const marketplaceService = {
    getConfig: jest.fn(),
  };

  const controller = new MarketplaceController(
    marketplaceService as unknown as MarketplaceService
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers GET config on the controller method', () => {
    const handler = MarketplaceController.prototype.getConfig;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('config');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });

  it('returns the backend-supported market configuration', () => {
    marketplaceService.getConfig.mockReturnValue({
      markets: [
        {
          code: 'VN',
          name: 'Vietnam',
          defaultCurrency: 'VND',
          supportedCurrencies: ['VND'],
          defaultLocale: 'vi-VN',
          supportedLocales: ['vi-VN', 'en-VN'],
          enabled: true,
        },
      ],
    });

    expect(controller.getConfig()).toEqual({
      markets: [
        {
          code: 'VN',
          name: 'Vietnam',
          defaultCurrency: 'VND',
          supportedCurrencies: ['VND'],
          defaultLocale: 'vi-VN',
          supportedLocales: ['vi-VN', 'en-VN'],
          enabled: true,
        },
      ],
    });
    expect(marketplaceService.getConfig).toHaveBeenCalledTimes(1);
  });
});
