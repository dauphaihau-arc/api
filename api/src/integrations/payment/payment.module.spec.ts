import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  PayoutGateway,
  PayoutProviderNotConfiguredError,
} from './app/ports/payout-gateway';
import { ManualBankPayoutGateway } from './infra/manual-bank-payout.gateway';
import { StripeConnectPayoutGateway } from './infra/stripe-connect-payout.gateway';
import { PaymentModule } from './payment.module';

function configService(
  values: Record<string, string | undefined>,
): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown) => values[key] ?? defaultValue,
  } as unknown as ConfigService;
}

async function resolvePayoutGateway(
  values: Record<string, string | undefined>,
): Promise<PayoutGateway> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [PaymentModule],
  })
    .overrideProvider(ConfigService)
    .useValue(configService({
      ...values,
      // A key is present unless a test deliberately removes it, so selecting
      // the Stripe adapter is independent of whether it can reach Stripe.
      STRIPE_SECRET_KEY: 'STRIPE_SECRET_KEY' in values
        ? values.STRIPE_SECRET_KEY
        : 'sk_test_123',
    }))
    .compile();

  const gateway = moduleRef.get(PayoutGateway);

  await moduleRef.close();

  return gateway;
}

describe('PaymentModule payout provider selection', () => {
  it('resolves the Stripe Connect adapter for PAYOUT_PROVIDER=stripe_connect', async () => {
    const gateway = await resolvePayoutGateway({
      PAYOUT_PROVIDER: 'stripe_connect',
    });

    expect(gateway).toBeInstanceOf(StripeConnectPayoutGateway);
  });

  it('resolves the manual bank adapter for PAYOUT_PROVIDER=manual_bank', async () => {
    const gateway = await resolvePayoutGateway({
      PAYOUT_PROVIDER: 'manual_bank',
    });

    expect(gateway).toBeInstanceOf(ManualBankPayoutGateway);
  });

  it('defaults to the manual bank adapter when PAYOUT_PROVIDER is unset', async () => {
    const gateway = await resolvePayoutGateway({});

    expect(gateway).toBeInstanceOf(ManualBankPayoutGateway);
  });

  it('keeps starting without a Stripe key, failing the transfer as unconfigured', async () => {
    const gateway = await resolvePayoutGateway({
      PAYOUT_PROVIDER: 'stripe_connect',
      STRIPE_SECRET_KEY: undefined,
    });

    expect(gateway).toBeInstanceOf(StripeConnectPayoutGateway);
    await expect(
      gateway.send({
        payoutPublicId: 'pay_unconfigured',
        provider: 'stripe_connect',
        amountMinor: 100,
        currency: 'USD',
        transferCurrency: 'USD',
        transferAmountMinor: 100,
        targetCurrency: 'USD',
        targetAmountMinor: 100,
        fxRate: '1',
        destination: { providerAccountId: 'acct_1', country: 'US' },
      }),
    ).rejects.toBeInstanceOf(PayoutProviderNotConfiguredError);
  });
});
