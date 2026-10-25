import type { PayoutQueryRepository } from '../../ports/payout-query.repository';
import type { PayoutSettingsRepository } from '../../ports/payout-settings.repository';
import type { PayoutAccountRepository } from '../../ports/payout-account.repository';
import type { SellerPayableQueryRepository } from '../../ports/seller-payable-query.repository';
import { GetPayoutSettingsUseCase } from './get-payout-settings.use-case';

const NOW = new Date('2026-10-20T10:00:00.000Z');

function setup(options: {
  unlimited: boolean;
  consumed: boolean;
  autoPayoutEnabled: boolean;
  hasPayoutAccount?: boolean;
}) {
  const payoutSettingsRepository = {
    find: jest.fn().mockResolvedValue({
      shopId: 'shop-1',
      autoPayoutEnabled: options.autoPayoutEnabled,
    }),
  } as unknown as PayoutSettingsRepository;
  const payoutQueryRepository = {
    hasConsumedManualPayout: jest.fn().mockResolvedValue(options.consumed),
  } as unknown as PayoutQueryRepository;
  const payoutAccountRepository = {
    findActiveByShopId: jest.fn().mockResolvedValue(
      options.hasPayoutAccount === false
        ? null
        : {
          id: 'account-1',
          shopId: 'shop-1',
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
        },
    ),
  } as unknown as PayoutAccountRepository;
  const sellerPayableQueryRepository = {
    findBalanceByShopId: jest.fn().mockResolvedValue({
      shopId: 'shop-1',
      currency: 'USD',
      availableMinor: 0,
      notYetAvailableMinor: 0,
    }),
  } as unknown as SellerPayableQueryRepository;

  return new GetPayoutSettingsUseCase(
    {
      autoPayoutDayOfMonth: 15,
      manualWithdrawalUnlimited: options.unlimited,
      autoPayoutForceDue: false,
      retryDelaysMs: [60_000, 300_000, 900_000],
      platformCurrency: 'USD',
    },
    payoutSettingsRepository,
    payoutQueryRepository,
    payoutAccountRepository,
    sellerPayableQueryRepository,
    { now: () => NOW },
    { platformCountry: 'US', countries: ['US'] },
  );
}

describe('GetPayoutSettingsUseCase', () => {
  it('reports the opted-out default with the allowance still available', async () => {
    await expect(
      setup({ unlimited: false, consumed: false, autoPayoutEnabled: false })
        .execute({ shopId: 'shop-1' }),
    ).resolves.toEqual({
      autoPayoutEnabled: false,
      autoPayoutDayOfMonth: 15,
      autoPayoutEligible: true,
      autoPayoutIneligibleReason: null,
      manualWithdrawalsRemaining: 1,
    });
  });

  it('reports no allowance left once the month manual withdrawal happened', async () => {
    await expect(
      setup({ unlimited: false, consumed: true, autoPayoutEnabled: true })
        .execute({ shopId: 'shop-1' }),
    ).resolves.toMatchObject({
      autoPayoutEnabled: true,
      manualWithdrawalsRemaining: 0,
    });
  });

  it('reports an unlimited allowance as null', async () => {
    const useCase = setup({
      unlimited: true,
      consumed: true,
      autoPayoutEnabled: true,
    });
    const settings = await useCase.execute({ shopId: 'shop-1' });

    expect(settings.manualWithdrawalsRemaining).toBeNull();
  });

  it('reports why auto payout cannot be enabled', async () => {
    await expect(
      setup({
        unlimited: false,
        consumed: false,
        autoPayoutEnabled: false,
        hasPayoutAccount: false,
      }).execute({ shopId: 'shop-1' }),
    ).resolves.toMatchObject({
      autoPayoutEligible: false,
      autoPayoutIneligibleReason: 'no_payout_account',
    });
  });
});
