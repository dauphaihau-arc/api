import { MoneyConversionService } from '~/integrations/currency/money-conversion.service';
import { RoundingPolicyService } from '~/integrations/currency/rounding-policy.service';
import type { FxRateService } from '~/integrations/currency/fx-rate.service';
import type { Clock } from '~/platform/time/clock';
import type {
  PayoutAccountRecord,
  PayoutAccountRepository,
} from '../../ports/payout-account.repository';
import type { SettlementCurrencyRepository } from '../../ports/settlement-currency.repository';
import {
  PayoutAccountUnusableError,
  PayoutConversionRateUnavailableError,
} from '../../errors/finance-app.error';
import { PayoutAmountNotPositiveError } from '../../../domain/errors/finance-domain.error';
import { PayoutQuoteService } from '../../services/payout-quote.service';
import { QuoteShopPayoutUseCase } from './quote-shop-payout.use-case';

const NOW = new Date('2026-10-24T10:00:00.000Z');
const SHOP_ID = 'shop-1';

function account(
  overrides: Partial<PayoutAccountRecord> = {},
): PayoutAccountRecord {
  return {
    id: 'account-1',
    shopId: SHOP_ID,
    provider: 'manual_bank',
    providerAccountId: null,
    country: 'US',
    currency: 'USD',
    status: 'active',
    payoutsEnabled: true,
    chargesEnabled: true,
    transfersCapability: 'active',
    requirements: null,
    defaultCurrency: 'USD',
    bankName: null,
    last4: null,
    updatedAt: NOW,
    ...overrides,
  };
}

function setup(options: {
  account?: PayoutAccountRecord | null;
  settlementCurrency?: string | null;
  rate?: string | null;
} = {}) {
  const payoutAccountRepository = {
    findActiveByShopId: jest
      .fn()
      .mockResolvedValue(
        options.account === undefined ? account() : options.account,
      ),
  } as unknown as PayoutAccountRepository;
  const settlementCurrencyRepository = {
    ensureCurrentCurrency: jest
      .fn()
      .mockResolvedValue(
        options.settlementCurrency === undefined
          ? 'USD'
          : options.settlementCurrency,
      ),
  } as unknown as SettlementCurrencyRepository;
  const fxRateService = {
    getLatestRate: jest.fn().mockResolvedValue(
      options.rate === null || options.rate === undefined
        ? null
        : { rate: options.rate, source: 'test', effectiveAt: NOW },
    ),
  } as unknown as FxRateService;

  return new QuoteShopPayoutUseCase(
    payoutAccountRepository,
    settlementCurrencyRepository,
    new PayoutQuoteService(
      new MoneyConversionService(fxRateService, new RoundingPolicyService()),
    ),
    { now: () => NOW } as Clock,
    { platformCountry: 'US', countries: ['US'] },
  );
}

describe('QuoteShopPayoutUseCase', () => {
  it.each([0, -1, 12.5])(
    'refuses a non-positive or fractional amount (%p)',
    async (amountMinor) => {
      await expect(
        setup().execute({ shopId: SHOP_ID, amountMinor }),
      ).rejects.toThrow(PayoutAmountNotPositiveError);
    },
  );

  it('refuses a shop with no Payout Account', async () => {
    await expect(
      setup({ account: null }).execute({ shopId: SHOP_ID, amountMinor: 12_500 }),
    ).rejects.toThrow(/no_payout_account/);
  });

  it.each([
    {
      status: 'onboarding',
      payoutAccount: account({ status: 'onboarding' }),
    },
    {
      status: 'action_required',
      payoutAccount: account({ status: 'action_required' }),
    },
    {
      status: 'restricted',
      payoutAccount: account({ status: 'restricted' }),
    },
    {
      status: 'disabled',
      payoutAccount: account({ status: 'disabled' }),
    },
  ])('refuses a $status Payout Account', async ({ payoutAccount }) => {
    await expect(
      setup({ account: payoutAccount }).execute({
        shopId: SHOP_ID,
        amountMinor: 12_500,
      }),
    ).rejects.toThrow(PayoutAccountUnusableError);
  });

  it('accepts an account currency that differs from the Settlement Currency', async () => {
    // The account currency is Stripe's; capability checks decide usability, not
    // a local currency matrix.
    await expect(
      setup({
        account: account({ country: 'US', currency: 'EUR' }),
        rate: '1.1',
      }).execute({ shopId: SHOP_ID, amountMinor: 12_500 }),
    ).resolves.toMatchObject({
      targetCurrency: 'EUR',
      estimated: true,
    });
  });

  it('estimates a same-currency payout as the identity without a fee', async () => {
    await expect(
      setup().execute({ shopId: SHOP_ID, amountMinor: 12_500 }),
    ).resolves.toEqual({
      sourceCurrency: 'USD',
      targetCurrency: 'USD',
      sourceAmountMinor: 12_500,
      fxRate: '1',
      targetAmountMinor: 12_500,
      estimated: true,
    });
  });

  it('estimates the whole amount converted into the account currency', async () => {
    // 125.00 USD at 25,000 VND per USD, with no platform fee: VND has no minor
    // unit, so the estimate is 3,125,000 whole dong.
    await expect(
      setup({
        account: account({ currency: 'VND' }),
        rate: '25000',
      }).execute({ shopId: SHOP_ID, amountMinor: 12_500 }),
    ).resolves.toEqual({
      sourceCurrency: 'USD',
      targetCurrency: 'VND',
      sourceAmountMinor: 12_500,
      fxRate: '25000',
      targetAmountMinor: 3_125_000,
      estimated: true,
    });
  });

  it('refuses to quote when the conversion rate is missing', async () => {
    await expect(
      setup({
        account: account({ currency: 'VND' }),
        rate: null,
      }).execute({ shopId: SHOP_ID, amountMinor: 12_500 }),
    ).rejects.toThrow(PayoutConversionRateUnavailableError);
  });

  it('refuses when the shop has no resolvable Settlement Currency', async () => {
    await expect(
      setup({ settlementCurrency: null }).execute({
        shopId: SHOP_ID,
        amountMinor: 12_500,
      }),
    ).rejects.toThrow(/Settlement Currency/);
  });
});
