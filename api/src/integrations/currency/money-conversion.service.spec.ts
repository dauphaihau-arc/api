import type { RoundingPolicyConfig } from '~/platform/config/rounding.config';
import type { ExchangeRateSnapshot, FxRateService } from './fx-rate.service';
import { MoneyConversionService } from './money-conversion.service';
import { RoundingPolicyService } from './rounding-policy.service';

const usdToVnd: ExchangeRateSnapshot = {
  fromCurrency: 'USD',
  toCurrency: 'VND',
  rate: '25000.5',
  effectiveAt: new Date('2026-09-26T00:00:00.000Z'),
  source: 'open-exchange-rates',
  sourceTimestamp: new Date('2026-09-25T00:00:00.000Z'),
};

const usdToEur: ExchangeRateSnapshot = {
  ...usdToVnd,
  toCurrency: 'EUR',
  rate: '1.00005',
};

function buildService(
  rate: ExchangeRateSnapshot | null,
  roundingPolicyService = new RoundingPolicyService(),
) {
  const getLatestRate = jest.fn().mockResolvedValue(rate);
  const service = new MoneyConversionService(
    { getLatestRate } as unknown as FxRateService,
    roundingPolicyService,
  );

  return { service, getLatestRate };
}

function buildConfig(overrides: Partial<RoundingPolicyConfig>): RoundingPolicyConfig {
  return {
    defaultMode: 'half_up',
    modeByCalculationType: {},
    incrementMinorByCurrency: {},
    ...overrides,
  };
}

describe('MoneyConversionService', () => {
  it('reports no conversion when the currency pair has no rate', async () => {
    const { service } = buildService(null);

    await expect(
      service.convert({ amountMinor: 100, fromCurrency: 'USD', toCurrency: 'VND' }),
    ).resolves.toBeUndefined();
  });

  it('returns the identical amount and no provenance for a same-currency conversion', async () => {
    const { service, getLatestRate } = buildService(usdToVnd);

    await expect(
      service.convert({ amountMinor: 9999, fromCurrency: 'KRW', toCurrency: 'KRW' }),
    ).resolves.toEqual({ amountMinor: 9999 });
    expect(getLatestRate).not.toHaveBeenCalled();
  });

  it('converts exactly and carries the rate provenance', async () => {
    const { service, getLatestRate } = buildService(usdToVnd);
    const rateCache = new Map();
    const at = new Date('2026-09-26T01:00:00.000Z');

    await expect(service.convert({
      amountMinor: 10_000,
      fromCurrency: 'USD',
      toCurrency: 'VND',
      at,
      rateCache,
    })).resolves.toEqual({
      amountMinor: 2_500_050,
      fx: {
        rate: '25000.5',
        source: 'open-exchange-rates',
        effectiveAt: usdToVnd.effectiveAt,
        sourceTimestamp: usdToVnd.sourceTimestamp,
      },
    });

    expect(getLatestRate).toHaveBeenCalledWith(
      { fromCurrency: 'USD', toCurrency: 'VND', at },
      rateCache,
    );
  });

  it('scales the source amount out of its own currency before applying the rate', async () => {
    const { service } = buildService({ ...usdToVnd, fromCurrency: 'JPY', rate: '0.0068' });

    await expect(
      service.convert({ amountMinor: 1_000, fromCurrency: 'JPY', toCurrency: 'USD' }),
    ).resolves.toMatchObject({ amountMinor: 680, fx: { rate: '0.0068' } });
  });

  it('rounds with the policy configured for the calculation type', async () => {
    const roundingPolicyService = new RoundingPolicyService(
      buildConfig({ modeByCalculationType: { price: 'half_even' } }),
    );
    const { service } = buildService(usdToEur, roundingPolicyService);
    const input = { amountMinor: 10_000, fromCurrency: 'USD', toCurrency: 'EUR' };

    await expect(service.convert({ ...input, calculationType: 'price' }))
      .resolves.toMatchObject({ amountMinor: 10_000 });
    await expect(service.convert(input))
      .resolves.toMatchObject({ amountMinor: 10_001 });
  });
});
