import type { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import type { ConnectAccountDetails } from '~/integrations/payment/app/ports/connect-gateway';
import type {
  PayoutAccountRecord,
  PayoutAccountRepository,
} from '../../ports/payout-account.repository';
import { SyncPayoutAccountUseCase } from './sync-payout-account.use-case';

function connectAccount(
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

function storedAccount(
  overrides: Partial<PayoutAccountRecord> = {},
): PayoutAccountRecord {
  return {
    id: 'account-1',
    shopId: 'shop-1',
    provider: 'stripe_connect',
    providerAccountId: 'acct_1',
    country: 'US',
    currency: 'USD',
    status: 'onboarding',
    payoutsEnabled: false,
    chargesEnabled: false,
    transfersCapability: null,
    requirements: null,
    defaultCurrency: null,
    bankName: null,
    last4: null,
    updatedAt: new Date('2026-10-24T10:00:00.000Z'),
    ...overrides,
  };
}

function setup(stored: PayoutAccountRecord | null) {
  const payoutAccountRepository = {
    findByProviderAccountId: jest.fn().mockResolvedValue(stored),
    updateActive: jest.fn(async (patch) => ({
      ...storedAccount(),
      ...patch,
    })),
  } as unknown as PayoutAccountRepository;
  const auditLogService = { record: jest.fn() } as unknown as AuditLogService;

  return {
    useCase: new SyncPayoutAccountUseCase(payoutAccountRepository, auditLogService),
    payoutAccountRepository,
    auditLogService,
  };
}

describe('SyncPayoutAccountUseCase', () => {
  it('ignores an account this deployment does not store', async () => {
    const { useCase, payoutAccountRepository, auditLogService } = setup(null);

    await expect(useCase.execute({
      account: connectAccount({ id: 'acct_unknown' }),
    })).resolves.toBeNull();

    expect(payoutAccountRepository.findByProviderAccountId)
      .toHaveBeenCalledWith('acct_unknown');
    expect(payoutAccountRepository.updateActive).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('derives active from capabilities and audits the changed fields once', async () => {
    const { useCase, payoutAccountRepository, auditLogService } = setup(storedAccount());

    const updated = await useCase.execute({ account: connectAccount() });

    expect(updated).toMatchObject({
      status: 'active',
      payoutsEnabled: true,
      chargesEnabled: true,
      transfersCapability: 'active',
      defaultCurrency: 'USD',
    });
    expect(payoutAccountRepository.updateActive).toHaveBeenCalledWith({
      shopId: 'shop-1',
      status: 'active',
      payoutsEnabled: true,
      chargesEnabled: true,
      transfersCapability: 'active',
      requirements: { currentlyDue: [], disabledReason: null },
      defaultCurrency: 'USD',
    });
    expect(auditLogService.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'finance.payout_account.synced',
      entityId: 'account-1',
      summary: expect.objectContaining({
        previousStatus: 'onboarding',
        status: 'active',
        changedFields: [
          'status',
          'payoutsEnabled',
          'chargesEnabled',
          'transfersCapability',
          'requirements',
          'defaultCurrency',
        ],
      }),
    }));
  });

  it('stores requirements as action_required and a disabled reason as restricted', async () => {
    const requirementsDue = setup(storedAccount());
    const actionRequired = await requirementsDue.useCase.execute({
      account: connectAccount({
        payoutsEnabled: false,
        transfersCapability: 'pending',
        requirementsDue: ['external_account'],
      }),
    });
    expect(actionRequired).toMatchObject({
      status: 'action_required',
      requirements: { currentlyDue: ['external_account'], disabledReason: null },
    });

    const disabled = setup(storedAccount());
    const restricted = await disabled.useCase.execute({
      account: connectAccount({
        payoutsEnabled: false,
        transfersCapability: 'inactive',
        disabledReason: 'requirements.past_due',
      }),
    });
    expect(restricted).toMatchObject({
      status: 'restricted',
      requirements: {
        currentlyDue: [],
        disabledReason: 'requirements.past_due',
      },
    });
  });

  it('stores the bank name and last four from the external account', async () => {
    const { useCase, payoutAccountRepository } = setup(storedAccount());

    const updated = await useCase.execute({
      account: connectAccount({
        externalAccount: {
          bankName: 'Chase',
          last4: '6789',
          currency: 'USD',
          country: 'US',
          defaultForCurrency: true,
        },
      }),
    });

    expect(updated).toMatchObject({ bankName: 'Chase', last4: '6789' });
    expect(payoutAccountRepository.updateActive).toHaveBeenCalledWith(
      expect.objectContaining({ bankName: 'Chase', last4: '6789' }),
    );
  });

  it('clears bank details when the payload has no external account', async () => {
    const { useCase, payoutAccountRepository } = setup(storedAccount({
      bankName: 'Chase',
      last4: '6789',
    }));

    const updated = await useCase.execute({
      account: connectAccount({ externalAccount: null }),
    });

    expect(updated).toMatchObject({ bankName: null, last4: null });
    expect(payoutAccountRepository.updateActive).toHaveBeenCalledWith(
      expect.objectContaining({ bankName: null, last4: null }),
    );
  });

  it('writes nothing when the reported state already matches', async () => {
    const stored = storedAccount({
      status: 'active',
      payoutsEnabled: true,
      chargesEnabled: true,
      transfersCapability: 'active',
      requirements: { currentlyDue: [], disabledReason: null },
      defaultCurrency: 'USD',
    });
    const { useCase, payoutAccountRepository, auditLogService } = setup(stored);

    await expect(useCase.execute({ account: connectAccount() }))
      .resolves.toBe(stored);

    expect(payoutAccountRepository.updateActive).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
  });
});
