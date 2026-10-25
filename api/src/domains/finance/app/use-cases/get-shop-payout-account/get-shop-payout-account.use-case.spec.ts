import {
  ConnectAccountNotFoundError,
  ConnectNotConfiguredError,
  type ConnectAccountDetails,
  type ConnectGateway,
} from '~/integrations/payment/app/ports/connect-gateway';
import type { PayoutAccountRepository, PayoutAccountRecord } from '../../ports/payout-account.repository';
import type { SyncPayoutAccountUseCase } from '../sync-payout-account/sync-payout-account.use-case';
import { GetShopPayoutAccountUseCase } from './get-shop-payout-account.use-case';

const SHOP_ID = 'shop-1';

function storedAccount(
  overrides: Partial<PayoutAccountRecord> = {},
): PayoutAccountRecord {
  return {
    id: 'account-1',
    shopId: SHOP_ID,
    provider: 'stripe_connect',
    providerAccountId: 'acct_1',
    country: 'US',
    currency: 'USD',
    status: 'onboarding',
    payoutsEnabled: false,
    chargesEnabled: false,
    transfersCapability: 'inactive',
    requirements: { currentlyDue: ['tos_acceptance.date'], disabledReason: null },
    defaultCurrency: 'USD',
    bankName: null,
    last4: null,
    updatedAt: new Date(Date.now() - 60_000),
    ...overrides,
  };
}

function providerAccount(
  overrides: Partial<ConnectAccountDetails> = {},
): ConnectAccountDetails {
  return {
    id: 'acct_1',
    country: 'US',
    defaultCurrency: 'USD',
    payoutsEnabled: true,
    chargesEnabled: true,
    transfersCapability: 'active',
    requirementsDue: [],
    disabledReason: null,
    externalAccount: null,
    ...overrides,
  };
}

function setup(stored: PayoutAccountRecord | null) {
  const payoutAccountRepository = {
    findActiveByShopId: jest.fn().mockResolvedValue(stored),
    touchActive: jest.fn().mockResolvedValue(undefined),
  };
  const synced = stored ? { ...stored, status: 'active' as const } : null;
  const syncPayoutAccountUseCase = {
    execute: jest.fn().mockResolvedValue(synced),
  };
  const connectGateway = {
    retrieveAccount: jest.fn().mockResolvedValue(providerAccount()),
    createAccount: jest.fn(),
    createAccountLink: jest.fn(),
  };

  return {
    useCase: new GetShopPayoutAccountUseCase(
      payoutAccountRepository as unknown as PayoutAccountRepository,
      syncPayoutAccountUseCase as unknown as SyncPayoutAccountUseCase,
      connectGateway as unknown as ConnectGateway,
    ),
    payoutAccountRepository,
    syncPayoutAccountUseCase,
    connectGateway,
    synced,
  };
}

describe('GetShopPayoutAccountUseCase', () => {
  it('re-reads a stale awaiting Connect account and returns the synced row', async () => {
    const {
      useCase, connectGateway, syncPayoutAccountUseCase, synced, 
    } =
      setup(storedAccount());

    const result = await useCase.execute({ shopId: SHOP_ID });

    const account = providerAccount();
    expect(connectGateway.retrieveAccount).toHaveBeenCalledWith('acct_1');
    expect(syncPayoutAccountUseCase.execute).toHaveBeenCalledWith({ account });
    expect(result).toBe(synced);
  });

  it('stamps the row so the next poll waits out the throttle', async () => {
    const { useCase, payoutAccountRepository } = setup(storedAccount());

    await useCase.execute({ shopId: SHOP_ID });

    expect(payoutAccountRepository.touchActive).toHaveBeenCalledWith(
      SHOP_ID,
      expect.any(Date),
    );
  });

  it('does not re-read within the throttle window', async () => {
    const { useCase, payoutAccountRepository, connectGateway } = setup(
      storedAccount(),
    );
    const refreshed = storedAccount({ updatedAt: new Date() });
    payoutAccountRepository.findActiveByShopId
      .mockResolvedValueOnce(storedAccount())
      .mockResolvedValue(refreshed);

    await useCase.execute({ shopId: SHOP_ID });
    const second = await useCase.execute({ shopId: SHOP_ID });

    expect(connectGateway.retrieveAccount).toHaveBeenCalledTimes(1);
    expect(second).toBe(refreshed);
  });

  it('skips an active account even when it is old', async () => {
    const active = storedAccount({ status: 'active' });
    const { useCase, connectGateway, syncPayoutAccountUseCase } = setup(active);

    const result = await useCase.execute({ shopId: SHOP_ID });

    expect(connectGateway.retrieveAccount).not.toHaveBeenCalled();
    expect(syncPayoutAccountUseCase.execute).not.toHaveBeenCalled();
    expect(result).toBe(active);
  });

  it('skips a recent awaiting account', async () => {
    const { useCase, connectGateway } = setup(
      storedAccount({ updatedAt: new Date() }),
    );

    await useCase.execute({ shopId: SHOP_ID });

    expect(connectGateway.retrieveAccount).not.toHaveBeenCalled();
  });

  it('skips a local account and a Connect row without an account id', async () => {
    const manual = setup(storedAccount({ provider: 'manual_bank' }));
    await manual.useCase.execute({ shopId: SHOP_ID });
    expect(manual.connectGateway.retrieveAccount).not.toHaveBeenCalled();

    const unlinked = setup(storedAccount({ providerAccountId: null }));
    await unlinked.useCase.execute({ shopId: SHOP_ID });
    expect(unlinked.connectGateway.retrieveAccount).not.toHaveBeenCalled();
  });

  it('skips silently when Connect is not configured', async () => {
    const { useCase, connectGateway, syncPayoutAccountUseCase } = setup(
      storedAccount(),
    );
    connectGateway.retrieveAccount.mockRejectedValue(
      new ConnectNotConfiguredError(),
    );

    const result = await useCase.execute({ shopId: SHOP_ID });

    expect(syncPayoutAccountUseCase.execute).not.toHaveBeenCalled();
    expect(result?.status).toBe('onboarding');
  });

  it('ignores an account Stripe no longer has', async () => {
    const { useCase, connectGateway, syncPayoutAccountUseCase } = setup(
      storedAccount(),
    );
    connectGateway.retrieveAccount.mockRejectedValue(
      new ConnectAccountNotFoundError('acct_1'),
    );

    const result = await useCase.execute({ shopId: SHOP_ID });

    expect(syncPayoutAccountUseCase.execute).not.toHaveBeenCalled();
    expect(result?.status).toBe('onboarding');
  });

  it('answers with the stored row when the provider read fails', async () => {
    const stored = storedAccount();
    const { useCase, connectGateway } = setup(stored);
    connectGateway.retrieveAccount.mockRejectedValue(new Error('Stripe is down'));

    const result = await useCase.execute({ shopId: SHOP_ID });

    expect(result).toBe(stored);
  });

  it('returns null when the shop has no payout account', async () => {
    const { useCase, connectGateway } = setup(null);

    const result = await useCase.execute({ shopId: SHOP_ID });

    expect(result).toBeNull();
    expect(connectGateway.retrieveAccount).not.toHaveBeenCalled();
  });
});
