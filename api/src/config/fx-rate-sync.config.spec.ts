import {
  buildFxRateSyncConfig,
} from './fx-rate-sync.config';
import { MARKETPLACE_CURRENCIES } from './marketplace.config';

describe('buildFxRateSyncConfig', () => {
  it('derives base and target currencies from enabled market currencies', () => {
    const config = buildFxRateSyncConfig({
      get: jest.fn((key: string, fallback?: unknown) => fallback),
    });

    expect(config.baseCurrencies).toEqual([...MARKETPLACE_CURRENCIES]);
    expect(config.targetCurrencies).toEqual([...MARKETPLACE_CURRENCIES]);
  });

  it('ignores legacy env currency lists and stays aligned with marketplace config', () => {
    const values: Record<string, string | undefined> = {
      FX_RATE_SYNC_BASE_CURRENCIES: 'USD',
      FX_RATE_SYNC_TARGET_CURRENCIES: 'USD,VND',
    };
    const config = buildFxRateSyncConfig({
      get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
    });

    expect(config.baseCurrencies).toEqual([...MARKETPLACE_CURRENCIES]);
    expect(config.targetCurrencies).toEqual([...MARKETPLACE_CURRENCIES]);
  });
});
