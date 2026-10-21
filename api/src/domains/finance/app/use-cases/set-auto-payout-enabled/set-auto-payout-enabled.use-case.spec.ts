import type { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import type { PayoutAccountRepository } from '../../ports/payout-account.repository';
import type { PayoutSettingsRepository } from '../../ports/payout-settings.repository';
import type { SettlementCurrencyRepository } from '../../ports/settlement-currency.repository';
import { AutoPayoutIneligibleError } from '../../errors/finance-app.error';
import { SetAutoPayoutEnabledUseCase } from './set-auto-payout-enabled.use-case';

function setup(options: { hasPayoutAccount: boolean }) {
  const payoutSettingsRepository = {
    setAutoPayoutEnabled: jest.fn().mockResolvedValue({
      shopId: 'shop-1',
      autoPayoutEnabled: true,
      autoPayoutEnabledAt: new Date('2026-10-20T10:00:00.000Z'),
    }),
  } as unknown as PayoutSettingsRepository;
  const payoutAccountRepository = {
    findActiveByShopId: jest.fn().mockResolvedValue(
      options.hasPayoutAccount
        ? {
          id: 'account-1',
          shopId: 'shop-1',
          type: 'bank',
          provider: 'manual_bank',
          holderName: 'Seller',
          bankName: 'Bank',
          country: 'US',
          currency: 'USD',
          last4: '4242',
          status: 'active',
          verifiedAt: new Date('2026-10-01T00:00:00.000Z'),
        }
        : null,
    ),
  } as unknown as PayoutAccountRepository;
  const settlementCurrencyRepository = {
    ensureCurrentCurrency: jest.fn().mockResolvedValue('USD'),
  } as unknown as SettlementCurrencyRepository;
  const auditLogService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditLogService;

  return {
    useCase: new SetAutoPayoutEnabledUseCase(
      payoutSettingsRepository,
      payoutAccountRepository,
      settlementCurrencyRepository,
      auditLogService,
      { now: () => new Date('2026-10-20T10:00:00.000Z') },
    ),
    payoutSettingsRepository,
  };
}

describe('SetAutoPayoutEnabledUseCase', () => {
  it('refuses to enable auto payout without a usable account', async () => {
    const { useCase, payoutSettingsRepository } = setup({ hasPayoutAccount: false });

    await expect(useCase.execute({
      shopId: 'shop-1',
      shopPublicId: 'shop_public_1',
      autoPayoutEnabled: true,
    })).rejects.toThrow(AutoPayoutIneligibleError);

    expect(payoutSettingsRepository.setAutoPayoutEnabled).not.toHaveBeenCalled();
  });

  it('enables auto payout for an eligible shop', async () => {
    const { useCase } = setup({ hasPayoutAccount: true });

    await expect(useCase.execute({
      shopId: 'shop-1',
      shopPublicId: 'shop_public_1',
      autoPayoutEnabled: true,
    })).resolves.toMatchObject({ autoPayoutEnabled: true });
  });

  it('lets an ineligible shop turn an existing auto payout off', async () => {
    const { useCase, payoutSettingsRepository } = setup({ hasPayoutAccount: false });

    await expect(useCase.execute({
      shopId: 'shop-1',
      shopPublicId: 'shop_public_1',
      autoPayoutEnabled: false,
    })).resolves.toBeDefined();

    expect(payoutSettingsRepository.setAutoPayoutEnabled).toHaveBeenCalled();
  });
});
