import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MarketController } from './market.controller';
import type { MarketService } from './market.service';

describe('MarketController', () => {
  const marketService = {
    getConfig: jest.fn(),
  };

  const controller = new MarketController(marketService as unknown as MarketService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers GET config on the controller method', () => {
    const handler = MarketController.prototype.getConfig;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('config');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });

  it('returns the backend-supported market configuration', () => {
    marketService.getConfig.mockReturnValue({
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
    expect(marketService.getConfig).toHaveBeenCalledTimes(1);
  });
});
