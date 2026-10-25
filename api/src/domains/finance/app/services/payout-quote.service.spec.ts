import { MoneyConversionService } from '~/integrations/currency/money-conversion.service';
import { RoundingPolicyService } from '~/integrations/currency/rounding-policy.service';
import type { FxRateService } from '~/integrations/currency/fx-rate.service';
import { PayoutConversionRateUnavailableError } from '../errors/finance-app.error';
import { PayoutQuoteService } from './payout-quote.service';

const EFFECTIVE_AT = new Date('2026-10-24T10:00:00.000Z');

function setup(options: { rate?: string | null } = {}) {
  const fxRateService = {
    getLatestRate: jest.fn().mockResolvedValue(
      options.rate === null || options.rate === undefined
        ? null
        : {
          rate: options.rate,
          source: 'test',
          effectiveAt: EFFECTIVE_AT,
        },
    ),
  } as unknown as FxRateService;

  return new PayoutQuoteService(
    new MoneyConversionService(fxRateService, new RoundingPolicyService()),
  );
}

describe('PayoutQuoteService', () => {
  it('estimates a same-currency payout as the identity', async () => {
    await expect(setup().quote({
      sourceCurrency: 'USD',
      targetCurrency: 'USD',
      sourceAmountMinor: 12_500,
    })).resolves.toEqual({
      sourceCurrency: 'USD',
      targetCurrency: 'USD',
      sourceAmountMinor: 12_500,
      fxRate: '1',
      targetAmountMinor: 12_500,
      estimated: true,
    });
  });

  it('converts the whole amount with no platform fee into a zero-decimal currency', async () => {
    // 125.00 USD at 25,000 VND per USD = 3,125,000 VND. VND has no minor unit,
    // so the target is a whole number of dong.
    await expect(setup({ rate: '25000' }).quote({
      sourceCurrency: 'USD',
      targetCurrency: 'VND',
      sourceAmountMinor: 12_500,
      at: EFFECTIVE_AT,
    })).resolves.toEqual({
      sourceCurrency: 'USD',
      targetCurrency: 'VND',
      sourceAmountMinor: 12_500,
      fxRate: '25000',
      targetAmountMinor: 3_125_000,
      estimated: true,
    });
  });

  it('rounds a fractional zero-decimal target half-up', async () => {
    // 10.00 USD at 25,000.55 VND leaves 250,005.5 dong, which rounds to
    // 250,006 because the target currency has no minor unit.
    const service = setup({ rate: '25000.55' });

    await expect(service.quote({
      sourceCurrency: 'USD',
      targetCurrency: 'VND',
      sourceAmountMinor: 1_000,
      at: EFFECTIVE_AT,
    })).resolves.toMatchObject({
      fxRate: '25000.55',
      targetAmountMinor: 250_006,
    });
  });

  it('refuses to estimate when no rate reaches the target currency', async () => {
    await expect(setup({ rate: null }).quote({
      sourceCurrency: 'USD',
      targetCurrency: 'VND',
      sourceAmountMinor: 12_500,
    })).rejects.toThrow(PayoutConversionRateUnavailableError);
  });
});
