import type { PayoutAccountRepository } from '../ports/payout-account.repository';
import type { PayoutSettingsRepository } from '../ports/payout-settings.repository';
import type { PayoutAccountStatus } from '../../domain/rules/payout-account';
import {
  OrderPayoutMethodService,
  resolveOrderPayoutMethod,
} from './order-payout-method.service';

const NOW = new Date('2026-10-15T09:00:00.000Z');

function account(status: PayoutAccountStatus) {
  return {
    id: 'account-1',
    shopId: 'shop-1',
    provider: 'manual_bank',
    providerAccountId: null,
    country: 'US',
    currency: 'USD',
    status,
    payoutsEnabled: status === 'active',
    chargesEnabled: status === 'active',
    transfersCapability: status === 'active' ? 'active' : null,
    requirements: null,
    defaultCurrency: 'USD',
    bankName: null,
    last4: null,
    updatedAt: NOW,
  };
}

function createService(options: {
  accountStatus: PayoutAccountStatus | null;
  autoPayoutEnabled: boolean;
  autoPayoutDayOfMonth?: number;
  now?: Date;
}) {
  const findActiveByShopId = jest
    .fn()
    .mockResolvedValue(options.accountStatus ? account(options.accountStatus) : null);
  const payoutAccountRepository = {
    findActiveByShopId,
  } as unknown as PayoutAccountRepository;
  const find = jest.fn().mockResolvedValue({
    shopId: 'shop-1',
    autoPayoutEnabled: options.autoPayoutEnabled,
    autoPayoutEnabledAt: null,
  });
  const payoutSettingsRepository = { find } as unknown as PayoutSettingsRepository;

  const service = new OrderPayoutMethodService(
    {
      autoPayoutDayOfMonth: options.autoPayoutDayOfMonth ?? 15,
      manualWithdrawalUnlimited: false,
      autoPayoutForceDue: false,
      retryDelaysMs: [60_000, 300_000, 900_000],
      platformCurrency: 'USD',
    },
    payoutAccountRepository,
    payoutSettingsRepository,
    { now: () => options.now ?? NOW },
  );

  return { service, findActiveByShopId, find };
}

describe('resolveOrderPayoutMethod', () => {
  it('reports a missing account when the shop has none', () => {
    expect(resolveOrderPayoutMethod({
      accountStatus: null,
      autoPayoutEnabled: false,
      autoPayoutDayOfMonth: 15,
      now: NOW,
    })).toEqual({
      accountStatus: 'missing',
      autoPayoutEnabled: false,
      autoPayoutDayOfMonth: 15,
      nextPayoutDate: null,
    });
  });

  it.each(['onboarding', 'action_required', 'restricted', 'disabled'] as const)(
    'reports the %s account status without scheduling a run',
    (status) => {
      expect(resolveOrderPayoutMethod({
        accountStatus: status,
        autoPayoutEnabled: true,
        autoPayoutDayOfMonth: 15,
        now: NOW,
      })).toEqual({
        accountStatus: status,
        autoPayoutEnabled: true,
        autoPayoutDayOfMonth: 15,
        nextPayoutDate: null,
      });
    },
  );

  it('schedules the next run for an active account with automatic payouts on', () => {
    expect(resolveOrderPayoutMethod({
      accountStatus: 'active',
      autoPayoutEnabled: true,
      autoPayoutDayOfMonth: 15,
      now: NOW,
    })).toEqual({
      accountStatus: 'active',
      autoPayoutEnabled: true,
      autoPayoutDayOfMonth: 15,
      nextPayoutDate: '2026-10-15',
    });
  });

  it('schedules no run when automatic payouts are off', () => {
    expect(resolveOrderPayoutMethod({
      accountStatus: 'active',
      autoPayoutEnabled: false,
      autoPayoutDayOfMonth: 15,
      now: NOW,
    })).toEqual({
      accountStatus: 'active',
      autoPayoutEnabled: false,
      autoPayoutDayOfMonth: 15,
      nextPayoutDate: null,
    });
  });

  it('clamps the run day to the last day of a shorter month', () => {
    expect(resolveOrderPayoutMethod({
      accountStatus: 'active',
      autoPayoutEnabled: true,
      autoPayoutDayOfMonth: 31,
      now: new Date('2026-02-01T00:00:00.000Z'),
    }).nextPayoutDate).toBe('2026-02-28');
  });
});

describe('OrderPayoutMethodService', () => {
  it('combines the open account status with the shop payout settings', async () => {
    const { service, findActiveByShopId, find } = createService({
      accountStatus: 'action_required',
      autoPayoutEnabled: true,
    });

    await expect(service.resolve('shop-1')).resolves.toEqual({
      accountStatus: 'action_required',
      autoPayoutEnabled: true,
      autoPayoutDayOfMonth: 15,
      nextPayoutDate: null,
    });
    expect(findActiveByShopId).toHaveBeenCalledWith('shop-1');
    expect(find).toHaveBeenCalledWith('shop-1');
  });

  it('reports a missing account without inventing a run date', async () => {
    const { service } = createService({
      accountStatus: null,
      autoPayoutEnabled: true,
      autoPayoutDayOfMonth: 5,
    });

    await expect(service.resolve('shop-1')).resolves.toEqual({
      accountStatus: 'missing',
      autoPayoutEnabled: true,
      autoPayoutDayOfMonth: 5,
      nextPayoutDate: null,
    });
  });

  it('reports the next run date for an active account with automatic payouts on', async () => {
    const { service } = createService({
      accountStatus: 'active',
      autoPayoutEnabled: true,
      autoPayoutDayOfMonth: 5,
    });

    await expect(service.resolve('shop-1')).resolves.toEqual({
      accountStatus: 'active',
      autoPayoutEnabled: true,
      autoPayoutDayOfMonth: 5,
      nextPayoutDate: '2026-11-05',
    });
  });
});
