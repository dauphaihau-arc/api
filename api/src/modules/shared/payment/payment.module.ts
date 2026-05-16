import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  PAYMENT_CONFIG,
  buildPaymentConfig
} from '../../../config/payment.config';
import { PaymentGateway } from './app/ports/payment-gateway';
import { StripePaymentGateway } from './infra/stripe-payment.gateway';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PAYMENT_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildPaymentConfig(configService),
    },
    {
      provide: PaymentGateway,
      inject: [PAYMENT_CONFIG],
      useFactory: (paymentConfig: ReturnType<typeof buildPaymentConfig>) =>
        new StripePaymentGateway(paymentConfig),
    },
  ],
  exports: [PAYMENT_CONFIG, PaymentGateway],
})
export class PaymentModule {}
