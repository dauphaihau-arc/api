import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  PAYMENT_CONFIG,
  type PaymentConfig,
  buildPaymentConfig,
} from '~/platform/config/payment.config';
import {
  PAYOUT_PROVIDER_CONFIG,
  type PayoutProviderConfig,
  buildPayoutProviderConfig,
} from '~/platform/config/payout-provider.config';
import { PaymentGateway } from './app/ports/payment-gateway';
import { PayoutGateway } from './app/ports/payout-gateway';
import {
  CONNECT_GATEWAY,
  type ConnectGateway,
} from './app/ports/connect-gateway';
import { ManualBankPayoutGateway } from './infra/manual-bank-payout.gateway';
import { StripeConnectGateway, NotConfiguredConnectGateway } from './infra/stripe-connect.gateway';
import { StripeConnectPayoutGateway } from './infra/stripe-connect-payout.gateway';
import { StripePaymentGateway } from './infra/stripe-payment.gateway';

/**
 * Chooses the payout adapter `PAYOUT_PROVIDER` names. `manual_bank` stays the
 * default so local development and the existing payout suites keep paying out
 * of band; production opts into Stripe with `stripe_connect`.
 */
export function selectPayoutGateway(
  payoutProviderConfig: Pick<PayoutProviderConfig, 'provider'>,
  manualBankGateway: PayoutGateway,
  stripeConnectGateway: PayoutGateway,
): PayoutGateway {
  return payoutProviderConfig.provider === 'stripe_connect'
    ? stripeConnectGateway
    : manualBankGateway;
}

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PAYMENT_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): PaymentConfig =>
        buildPaymentConfig(configService),
    },
    {
      provide: PAYOUT_PROVIDER_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): PayoutProviderConfig =>
        buildPayoutProviderConfig(configService),
    },
    {
      provide: PaymentGateway,
      inject: [PAYMENT_CONFIG],
      useFactory: (paymentConfig: PaymentConfig) =>
        new StripePaymentGateway(paymentConfig),
    },
    {
      provide: ManualBankPayoutGateway,
      // The `manual_bank` adapter reads its local/test stub switches from the
      // environment at construction, so it is built explicitly instead of by
      // class injection. Keeping it registered means tests can still resolve
      // and construct it directly.
      useFactory: () => new ManualBankPayoutGateway(),
    },
    {
      provide: StripeConnectPayoutGateway,
      inject: [PAYMENT_CONFIG],
      useFactory: (paymentConfig: PaymentConfig) =>
        new StripeConnectPayoutGateway(paymentConfig),
    },
    {
      provide: PayoutGateway,
      inject: [
        PAYOUT_PROVIDER_CONFIG,
        ManualBankPayoutGateway,
        StripeConnectPayoutGateway,
      ],
      useFactory: selectPayoutGateway,
    },
    {
      provide: CONNECT_GATEWAY,
      inject: [PAYMENT_CONFIG],
      useFactory: (paymentConfig: PaymentConfig): ConnectGateway =>
        paymentConfig.stripeSecretKey
          ? new StripeConnectGateway(paymentConfig)
          : new NotConfiguredConnectGateway(),
    },
  ],
  exports: [PAYMENT_CONFIG, PaymentGateway, PayoutGateway, CONNECT_GATEWAY],
})
export class PaymentModule {}
