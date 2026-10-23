import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  PAYMENT_CONFIG,
  type PaymentConfig,
  buildPaymentConfig,
} from '~/platform/config/payment.config';
import { PaymentGateway } from './app/ports/payment-gateway';
import { PayoutGateway } from './app/ports/payout-gateway';
import { ManualBankPayoutGateway } from './infra/manual-bank-payout.gateway';
import { StripePaymentGateway } from './infra/stripe-payment.gateway';

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
      provide: PaymentGateway,
      inject: [PAYMENT_CONFIG],
      useFactory: (paymentConfig: PaymentConfig) =>
        new StripePaymentGateway(paymentConfig),
    },
    {
      provide: PayoutGateway,
      // The `manual_bank` adapter reads its local/test stub switches from the
      // environment at construction, so it is built explicitly instead of by
      // class injection.
      useFactory: () => new ManualBankPayoutGateway(),
    },
  ],
  exports: [PAYMENT_CONFIG, PaymentGateway, PayoutGateway],
})
export class PaymentModule {}
