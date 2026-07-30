import type { UserPreferenceRepository } from '~/domains/auth/app/ports/user-preference.repository';
import type { RequestContextService } from '~/platform/request-context/request-context.service';
import { StorefrontMarketContextService } from './storefront-market-context.service';

describe('StorefrontMarketContextService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prefers authenticated user preferences over request headers', async () => {
    const requestContextService: Pick<
      jest.Mocked<RequestContextService>,
      'get' | 'getStorefrontMarketContext' | 'setStorefrontMarketContext'
    > = {
      get: jest.fn().mockReturnValue({
        actorId: 'user-1',
        marketCode: 'US',
        currency: 'USD',
        locale: 'en-US',
      }),
      getStorefrontMarketContext: jest.fn().mockReturnValue(undefined),
      setStorefrontMarketContext: jest.fn(),
    };
    const userPreferenceRepository: Pick<jest.Mocked<UserPreferenceRepository>, 'findByUserId'> = {
      findByUserId: jest.fn().mockResolvedValue({
        region: 'Vietnam',
        currency: 'VND',
        language: 'en',
      }),
    };
    const service = new StorefrontMarketContextService(
      requestContextService as never,
      userPreferenceRepository as never,
    );

    await expect(service.resolveCurrentRequest()).resolves.toEqual({
      marketCode: 'VN',
      currency: 'VND',
      locale: 'en-VN',
      requestedCurrency: 'VND',
      source: 'user_preferences',
    });

    expect(userPreferenceRepository.findByUserId).toHaveBeenCalledWith('user-1');
    expect(requestContextService.setStorefrontMarketContext).toHaveBeenCalledWith({
      marketCode: 'VN',
      currency: 'VND',
      locale: 'en-VN',
      requestedCurrency: 'VND',
      source: 'user_preferences',
    });
  });

  it('falls back to request headers for guests', async () => {
    const requestContextService: Pick<
      jest.Mocked<RequestContextService>,
      'get' | 'getStorefrontMarketContext' | 'setStorefrontMarketContext'
    > = {
      get: jest.fn().mockReturnValue({
        marketCode: 'VN',
        currency: 'EUR',
        locale: 'en-VN',
      }),
      getStorefrontMarketContext: jest.fn().mockReturnValue(undefined),
      setStorefrontMarketContext: jest.fn(),
    };
    const userPreferenceRepository: Pick<jest.Mocked<UserPreferenceRepository>, 'findByUserId'> = {
      findByUserId: jest.fn(),
    };
    const service = new StorefrontMarketContextService(
      requestContextService as never,
      userPreferenceRepository as never,
    );

    await expect(service.resolveCurrentRequest()).resolves.toEqual({
      marketCode: 'VN',
      currency: 'EUR',
      locale: 'en-VN',
      requestedCurrency: 'EUR',
      source: 'request_headers',
    });
    expect(userPreferenceRepository.findByUserId).not.toHaveBeenCalled();
  });

  it('builds a denormalized sort key only for default market currency', async () => {
    const requestContextService: Pick<
      jest.Mocked<RequestContextService>,
      'get' | 'getStorefrontMarketContext' | 'setStorefrontMarketContext'
    > = {
      get: jest.fn().mockReturnValue({ actorId: 'user-1' }),
      getStorefrontMarketContext: jest.fn().mockReturnValue(undefined),
      setStorefrontMarketContext: jest.fn(),
    };
    const userPreferenceRepository: Pick<jest.Mocked<UserPreferenceRepository>, 'findByUserId'> = {
      findByUserId: jest.fn().mockResolvedValue({
        region: 'Vietnam',
        currency: 'VND',
        language: 'en',
      }),
    };
    const service = new StorefrontMarketContextService(
      requestContextService as never,
      userPreferenceRepository as never,
    );

    await expect(service.getCurrentSortPriceKey()).resolves.toBe('VN:VND');
  });
});
