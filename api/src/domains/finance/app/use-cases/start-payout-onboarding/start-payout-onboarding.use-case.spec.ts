import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import type { ConnectGateway } from '~/integrations/payment/app/ports/connect-gateway';
import type { PayoutProviderConfig } from '~/platform/config/payout-provider.config';
import type { PayoutConnectCountriesConfig } from '~/platform/config/payout-country.config';
import type {
  PayoutAccountRecord,
  PayoutAccountRepository,
} from '../../ports/payout-account.repository';
import type { SettlementCurrencyRepository } from '../../ports/settlement-currency.repository';
import { StartPayoutOnboardingUseCase } from './start-payout-onboarding.use-case';

const MANUAL_CONFIG: PayoutProviderConfig = {
  provider: 'manual_bank',
  connectReturnUrl: 'https://seller.test/finances?onboarding=return',
  connectRefreshUrl: 'https://seller.test/finances?onboarding=refresh',
};

const STRIPE_CONNECT_CONFIG: PayoutProviderConfig = {
  ...MANUAL_CONFIG,
  provider: 'stripe_connect',
};

function account(
  overrides: Partial<PayoutAccountRecord> = {},
): PayoutAccountRecord {
  return {
    id: 'account-1',
    shopId: 'shop-1',
    provider: 'manual_bank',
    providerAccountId: null,
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

function setup(
  existing: PayoutAccountRecord | null,
  providerConfig: PayoutProviderConfig = MANUAL_CONFIG,
  connectCountries: PayoutConnectCountriesConfig = { platformCountry: 'US', countries: ['US', 'GB'] },
) {
  const payoutAccountRepository = {
    findActiveByShopId: jest.fn().mockResolvedValue(existing),
    createActive: jest.fn(async (input, _context) =>
      account({
        provider: input.provider,
        country: input.country,
        currency: input.currency,
        status: input.status,
        providerAccountId: input.providerAccountId,
      })),
    updateActive: jest.fn(async (input) =>
      account({
        ...existing,
        provider: input.provider,
        country: input.country,
        currency: input.currency,
        status: input.status,
      })),
  } as unknown as PayoutAccountRepository;
  const settlementCurrencyRepository = {
    ensureCurrentCurrency: jest.fn().mockResolvedValue('USD'),
  } as unknown as SettlementCurrencyRepository;
  const connectGateway = {
    createAccount: jest.fn(),
    createAccountLink: jest.fn(),
    retrieveAccount: jest.fn(),
  } as unknown as ConnectGateway;
  const auditLogService = { record: jest.fn() } as unknown as AuditLogService;
  const entityManager = {
    transactional: jest.fn(async (work: (em: EntityManager) => unknown) =>
      work({} as EntityManager)),
  } as unknown as EntityManager;

  return {
    useCase: new StartPayoutOnboardingUseCase(
      entityManager,
      payoutAccountRepository,
      settlementCurrencyRepository,
      providerConfig,
      connectCountries,
      connectGateway,
      auditLogService,
    ),
    payoutAccountRepository,
    connectGateway,
    auditLogService,
  };
}

describe('StartPayoutOnboardingUseCase (manual_bank)', () => {
  it('creates an active local account without touching Stripe', async () => {
    const {
      useCase,
      payoutAccountRepository,
      connectGateway,
      auditLogService,
    } = setup(null);

    const result = await useCase.execute({
      shopId: 'shop-1',
      shopPublicId: 'shop_public_1',
      email: 'seller@example.com',
      country: 'us',
    });

    expect(result).toEqual({ url: null, status: 'active' });
    expect(payoutAccountRepository.createActive).toHaveBeenCalledWith(
      {
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
      },
      { entityManager: {} },
    );
    expect(connectGateway.createAccount).not.toHaveBeenCalled();
    expect(connectGateway.createAccountLink).not.toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'finance.payout_account.onboarding_started',
      entityId: 'account-1',
      entityPublicId: 'shop_public_1',
      summary: expect.objectContaining({
        shopId: 'shop-1',
        provider: 'manual_bank',
        status: 'active',
      }),
    }));
  });

  it('reactivates the shop\'s open account instead of creating another', async () => {
    const { useCase, payoutAccountRepository, connectGateway } = setup(account({
      status: 'onboarding',
      payoutsEnabled: false,
      transfersCapability: null,
    }));

    const result = await useCase.execute({
      shopId: 'shop-1',
      shopPublicId: 'shop_public_1',
      email: 'seller@example.com',
      country: 'US',
    });

    expect(result).toEqual({ url: null, status: 'active' });
    expect(payoutAccountRepository.createActive).not.toHaveBeenCalled();
    expect(payoutAccountRepository.updateActive).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 'shop-1',
        provider: 'manual_bank',
        status: 'active',
      }),
      expect.anything(),
    );
    expect(connectGateway.createAccount).not.toHaveBeenCalled();
  });

  it('refuses a country that is not an ISO alpha-2 code before any write', async () => {
    const { useCase, payoutAccountRepository } = setup(null);

    await expect(useCase.execute({
      shopId: 'shop-1',
      shopPublicId: 'shop_public_1',
      email: 'seller@example.com',
      country: 'USA',
    })).rejects.toThrow(/country must be an ISO 3166-1 alpha-2 code/);

    expect(payoutAccountRepository.createActive).not.toHaveBeenCalled();
  });
});

describe('StartPayoutOnboardingUseCase (stripe_connect)', () => {
  it('refuses a country outside the allowlist before calling Connect', async () => {
    const {
      useCase,
      payoutAccountRepository,
      connectGateway,
      auditLogService,
    } = setup(null, STRIPE_CONNECT_CONFIG, { platformCountry: 'US', countries: ['US', 'GB'] });

    await expect(useCase.execute({
      shopId: 'shop-1',
      shopPublicId: 'shop_public_1',
      email: 'seller@example.com',
      country: 'VN',
    })).rejects.toThrow(/does not support onboarding sellers in VN/);

    expect(connectGateway.createAccount).not.toHaveBeenCalled();
    expect(connectGateway.createAccountLink).not.toHaveBeenCalled();
    expect(payoutAccountRepository.createActive).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it.each(['AU', 'JP', 'SG'])(
    'refuses the unsupported payout region %s before calling Connect',
    async (country) => {
      const { useCase, connectGateway, payoutAccountRepository } = setup(
        null,
        STRIPE_CONNECT_CONFIG,
        { platformCountry: 'US', countries: ['US', 'GB'] },
      );

      await expect(useCase.execute({
        shopId: 'shop-1',
        shopPublicId: 'shop_public_1',
        email: 'seller@example.com',
        country,
      })).rejects.toThrow(/does not support onboarding sellers/);

      expect(connectGateway.createAccount).not.toHaveBeenCalled();
      expect(payoutAccountRepository.createActive).not.toHaveBeenCalled();
    },
  );

  it('creates the Connect account for an allowlisted country', async () => {
    const { useCase, connectGateway } = setup(
      null,
      STRIPE_CONNECT_CONFIG,
      { platformCountry: 'US', countries: ['US', 'GB'] },
    );
    (connectGateway.createAccount as jest.Mock).mockResolvedValue({
      id: 'acct_1',
    });
    (connectGateway.createAccountLink as jest.Mock).mockResolvedValue({
      url: 'https://connect.test/setup/acct_1',
    });

    const result = await useCase.execute({
      shopId: 'shop-1',
      shopPublicId: 'shop_public_1',
      email: 'seller@example.com',
      country: 'gb',
    });

    expect(connectGateway.createAccount).toHaveBeenCalledWith({
      country: 'GB',
      email: 'seller@example.com',
    });
    expect(result).toEqual({
      url: 'https://connect.test/setup/acct_1',
      status: 'onboarding',
    });
  });
});
