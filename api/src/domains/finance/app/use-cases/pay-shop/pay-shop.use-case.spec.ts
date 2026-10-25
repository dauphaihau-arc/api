import type { EntityManager } from '@mikro-orm/postgresql';
import type { PayoutConfig } from '~/platform/config/payout.config';
import type { PayoutConnectCountriesConfig } from '~/platform/config/payout-country.config';
import type { MoneyConversionService } from '~/integrations/currency/money-conversion.service';
import { MoneyConversionService as RealMoneyConversionService } from '~/integrations/currency/money-conversion.service';
import type { FxRateService } from '~/integrations/currency/fx-rate.service';
import { RoundingPolicyService } from '~/integrations/currency/rounding-policy.service';
import {
  PayoutGateway,
  type PayoutProviderBalance,
  type PayoutTransferInput,
  type PayoutTransferResult,
} from '~/integrations/payment/app/ports/payout-gateway';
import type {
  PayoutAccountPaymentTarget,
  PayoutAccountRepository,
} from '../../ports/payout-account.repository';
import type {
  PayoutCommandRepository,
  ClaimPayoutInput,
  ClaimPayoutResult,
} from '../../ports/payout-command.repository';
import type { PayoutQueryRepository } from '../../ports/payout-query.repository';
import type { PayoutRecord } from '../../ports/payout.types';
import type { SellerPayableQueryRepository } from '../../ports/seller-payable-query.repository';
import type { PayoutAttemptService } from '../../services/payout-attempt.service';
import {
  PayoutConversionRateUnavailableError,
  ProviderBalancePendingError,
} from '../../errors/finance-app.error';
import { PayShopUseCase } from './pay-shop.use-case';

const SHOP_ID = 'shop-1';
const PAYOUT_ID = 'payout-1';
const NOW = new Date('2026-10-20T10:00:00.000Z');

const ACCOUNT = {
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
} as const;

const TARGET: PayoutAccountPaymentTarget = {
  id: 'account-1',
  shopId: SHOP_ID,
  provider: 'manual_bank',
  providerAccountId: null,
  country: 'US',
  currency: 'USD',
};

class RecordingPayoutGateway extends PayoutGateway {
  readonly calls: PayoutTransferInput[] = [];
  readonly balanceCurrencies: string[] = [];
  balance: PayoutProviderBalance | null = {
    currency: 'USD',
    availableMinor: Number.MAX_SAFE_INTEGER,
    pendingMinor: 0,
  };

  async send(input: PayoutTransferInput): Promise<PayoutTransferResult> {
    this.calls.push(input);

    return { reference: `ref_${this.calls.length}` };
  }

  async retrieveBalance(currency: string): Promise<PayoutProviderBalance | null> {
    this.balanceCurrencies.push(currency);

    return this.balance ? { ...this.balance, currency } : null;
  }
}

function payoutRecord(currency = 'USD'): PayoutRecord {
  return {
    id: PAYOUT_ID,
    publicId: 'pay_1',
    payoutNumber: 'PAY-20261020-000001',
    amountMinor: 12_500,
    currency,
    state: 'paid',
    sourceCurrency: currency,
    targetCurrency: 'USD',
    transferCurrency: 'USD',
    transferAmountMinor: 12_500,
    fxRate: '1',
    targetAmountMinor: null,
    fxFeeMinor: 0,
    providerFxRate: null,
    source: 'manual',
    periodKey: '2026-10',
    reason: null,
    providerReference: 'ref_1',
    paidAt: NOW,
    createdAt: NOW,
  };
}

interface SetupOptions {
  shopCurrency?: string;
  amountMinor?: number;
  source?: 'manual' | 'scheduled';
  balance?: PayoutProviderBalance | null;
  converted?: { amountMinor: number; fx?: { rate: string } } | undefined;
  /** A real rate, to exercise the actual conversion and its minor-unit scales. */
  realRate?: string;
  platformCurrency?: string;
}

function setup(options: SetupOptions = {}) {
  const {
    shopCurrency = 'USD',
    amountMinor = 12_500,
    platformCurrency = 'USD',
  } = options;

  const claim = jest.fn(async (_input: ClaimPayoutInput): Promise<ClaimPayoutResult> => ({
    payout: { id: PAYOUT_ID, publicId: 'pay_1', currency: shopCurrency },
  }));
  const gateway = new RecordingPayoutGateway();
  gateway.balance = options.balance === undefined
    ? { currency: platformCurrency, availableMinor: Number.MAX_SAFE_INTEGER, pendingMinor: 0 }
    : options.balance;

  const entityManager = {
    transactional: async <T>(work: (em: unknown) => Promise<T>): Promise<T> =>
      work({ execute: async () => [] }),
  } as unknown as EntityManager;

  const payoutQueryRepository = {
    findPayableOrders: jest.fn().mockResolvedValue([
      { orderId: 'order-1', amountMinor },
    ]),
    findById: jest.fn().mockResolvedValue(payoutRecord(shopCurrency)),
  } as unknown as PayoutQueryRepository;

  const payoutCommandRepository = {
    claim,
    recordBlocked: jest.fn(),
  } as unknown as PayoutCommandRepository;

  const payoutAccountRepository = {
    findActiveByShopId: jest.fn().mockResolvedValue({ ...ACCOUNT, currency: 'USD' }),
    findPayableByShopId: jest.fn().mockResolvedValue({ ...TARGET, currency: 'USD' }),
  } as unknown as PayoutAccountRepository;

  const sellerPayableQueryRepository = {
    findBalanceByShopId: jest.fn().mockResolvedValue({
      shopId: SHOP_ID,
      currency: shopCurrency,
      availableMinor: amountMinor,
      notYetAvailableMinor: 0,
    }),
  } as unknown as SellerPayableQueryRepository;

  const payoutAttemptService = {
    attempt: jest.fn().mockResolvedValue('paid'),
  } as unknown as PayoutAttemptService;

  const moneyConversionService = options.realRate === undefined
    ? {
      convert: jest.fn().mockResolvedValue(options.converted),
    } as unknown as MoneyConversionService
    : new RealMoneyConversionService(
      {
        getLatestRate: jest.fn().mockResolvedValue({
          rate: options.realRate,
          source: 'test',
          effectiveAt: NOW,
        }),
      } as unknown as FxRateService,
      new RoundingPolicyService(),
    );

  const payoutConfig = {
    platformCurrency,
  } as unknown as PayoutConfig;

  const payoutConnectCountriesConfig: PayoutConnectCountriesConfig = {
    platformCountry: 'US',
    countries: ['US'],
  };

  const useCase = new PayShopUseCase(
    entityManager,
    payoutQueryRepository,
    payoutCommandRepository,
    payoutAccountRepository,
    sellerPayableQueryRepository,
    payoutAttemptService,
    moneyConversionService,
    gateway,
    payoutConfig,
    payoutConnectCountriesConfig,
  );

  return {
    useCase,
    claim,
    gateway,
    payoutAttemptService,
    moneyConversionService,
  };
}

function payShopInput(source: 'manual' | 'scheduled', currency: string) {
  return {
    shopId: SHOP_ID,
    currency,
    runDay: '2026-10-20',
    source,
    periodKey: '2026-10',
    quotaConsumed: true,
  } as const;
}

describe('PayShopUseCase platform-currency claim', () => {
  it('claims an identity conversion when the shop already settles in the platform currency', async () => {
    const {
      useCase, claim, gateway, moneyConversionService, 
    } = setup();

    const result = await useCase.execute(payShopInput('manual', 'USD'));

    expect(result.outcome).toBe('paid');
    expect(moneyConversionService.convert).not.toHaveBeenCalled();
    expect(claim).toHaveBeenCalledTimes(1);
    expect(claim.mock.calls[0]![0]).toMatchObject({
      currency: 'USD',
      amountMinor: 12_500,
      sourceCurrency: 'USD',
      targetCurrency: 'USD',
      transferCurrency: 'USD',
      transferAmountMinor: 12_500,
      fxRate: '1',
      targetAmountMinor: null,
    });
    // One balance read for the whole attempt, in the transfer currency.
    expect(gateway.balanceCurrencies).toEqual(['USD']);
  });

  it('converts a zero-decimal shop currency into the platform currency at claim time', async () => {
    const {
      useCase, claim, moneyConversionService, gateway, 
    } = setup({
      shopCurrency: 'VND',
      amountMinor: 250_000_000,
      converted: { amountMinor: 9_800, fx: { rate: '0.0000392' } },
    });

    await useCase.execute(payShopInput('manual', 'VND'));

    expect(moneyConversionService.convert).toHaveBeenCalledWith({
      amountMinor: 250_000_000,
      fromCurrency: 'VND',
      toCurrency: 'USD',
    });
    expect(claim.mock.calls[0]![0]).toMatchObject({
      currency: 'VND',
      amountMinor: 250_000_000,
      sourceCurrency: 'VND',
      transferCurrency: 'USD',
      transferAmountMinor: 9_800,
      fxRate: '0.0000392',
    });
    // The provider is checked in the platform currency, not the shop one.
    expect(gateway.balanceCurrencies).toEqual(['USD']);
  });

  it('refuses the claim when no rate converts the shop currency into the platform currency', async () => {
    const {
      useCase, claim, payoutAttemptService, gateway, 
    } = setup({
      shopCurrency: 'CAD',
      converted: undefined,
    });

    await expect(useCase.execute(payShopInput('manual', 'CAD'))).rejects.toBeInstanceOf(
      PayoutConversionRateUnavailableError,
    );
    expect(claim).not.toHaveBeenCalled();
    expect(payoutAttemptService.attempt).not.toHaveBeenCalled();
    // Nothing was claimed, so the balance was never even needed.
    expect(gateway.balanceCurrencies).toEqual([]);
  });

  it('refuses a manual withdrawal while the provider is still settling the funds', async () => {
    const { useCase, claim, payoutAttemptService } = setup({
      shopCurrency: 'CAD',
      converted: { amountMinor: 9_000, fx: { rate: '0.9' } },
      balance: { currency: 'USD', availableMinor: 1_000, pendingMinor: 8_000 },
    });

    const run = useCase.execute(payShopInput('manual', 'CAD'));

    await expect(run).rejects.toBeInstanceOf(ProviderBalancePendingError);
    await expect(run).rejects.toMatchObject({
      fundingState: 'pending',
      message: 'Your payout provider is still settling funds; try again later.',
    });
    expect(claim).not.toHaveBeenCalled();
    expect(payoutAttemptService.attempt).not.toHaveBeenCalled();
  });

  it('skips a scheduled payout while the provider is still settling the funds', async () => {
    const { useCase, claim, payoutAttemptService } = setup({
      shopCurrency: 'CAD',
      converted: { amountMinor: 9_000, fx: { rate: '0.9' } },
      balance: { currency: 'USD', availableMinor: 1_000, pendingMinor: 8_000 },
    });

    await expect(useCase.execute(payShopInput('scheduled', 'CAD'))).resolves.toEqual({
      outcome: 'skipped',
      payout: null,
    });
    expect(claim).not.toHaveBeenCalled();
    expect(payoutAttemptService.attempt).not.toHaveBeenCalled();
  });

  it('blocks a manual withdrawal when the platform holds no balance in the transfer currency', async () => {
    const { useCase, claim, payoutAttemptService } = setup({
      shopCurrency: 'CAD',
      converted: { amountMinor: 9_000, fx: { rate: '0.9' } },
      balance: null,
    });

    const run = useCase.execute(payShopInput('manual', 'CAD'));

    await expect(run).rejects.toBeInstanceOf(ProviderBalancePendingError);
    await expect(run).rejects.toMatchObject({
      fundingState: 'unfunded',
      message: expect.stringContaining('USD'),
    });
    expect(claim).not.toHaveBeenCalled();
    expect(payoutAttemptService.attempt).not.toHaveBeenCalled();
  });

  it('skips a scheduled payout when the platform holds no balance in the transfer currency', async () => {
    const { useCase, claim, payoutAttemptService } = setup({
      shopCurrency: 'CAD',
      converted: { amountMinor: 9_000, fx: { rate: '0.9' } },
      balance: null,
    });

    await expect(useCase.execute(payShopInput('scheduled', 'CAD'))).resolves.toEqual({
      outcome: 'skipped',
      payout: null,
    });
    expect(claim).not.toHaveBeenCalled();
    expect(payoutAttemptService.attempt).not.toHaveBeenCalled();
  });

  it('blocks when even the pending balance cannot cover the transfer', async () => {
    const { useCase, claim } = setup({
      shopCurrency: 'CAD',
      converted: { amountMinor: 9_000, fx: { rate: '0.9' } },
      balance: { currency: 'USD', availableMinor: 500, pendingMinor: 500 },
    });

    const run = useCase.execute(payShopInput('manual', 'CAD'));

    await expect(run).rejects.toMatchObject({
      fundingState: 'insufficient',
      message: expect.stringContaining('USD'),
    });
    expect(claim).not.toHaveBeenCalled();
  });

  it('proceeds when available funds cover the converted amount', async () => {
    const { useCase, claim } = setup({
      shopCurrency: 'CAD',
      converted: { amountMinor: 9_000, fx: { rate: '0.9' } },
      balance: { currency: 'USD', availableMinor: 9_000, pendingMinor: 0 },
    });

    await useCase.execute(payShopInput('manual', 'CAD'));

    expect(claim.mock.calls[0]![0]).toMatchObject({
      transferCurrency: 'USD',
      transferAmountMinor: 9_000,
      fxRate: '0.9',
    });
  });

  it('hands the frozen conversion to the provider attempt', async () => {
    const { useCase, payoutAttemptService } = setup({
      shopCurrency: 'CAD',
      converted: { amountMinor: 9_000, fx: { rate: '0.9' } },
      balance: { currency: 'USD', availableMinor: 9_000, pendingMinor: 0 },
    });

    await useCase.execute(payShopInput('manual', 'CAD'));

    expect(payoutAttemptService.attempt).toHaveBeenCalledWith(
      expect.objectContaining({
        payout: expect.objectContaining({
          // The ledger amount stays in the shop currency; only the transfer is
          // converted.
          currency: 'CAD',
          amountMinor: 12_500,
          transferCurrency: 'USD',
          transferAmountMinor: 9_000,
          fxRate: '0.9',
        }),
      }),
    );
  });
});
