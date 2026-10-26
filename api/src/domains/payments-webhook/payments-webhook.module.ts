import { Module } from '@nestjs/common';
import { FinanceModule } from '~/domains/finance/finance.module';
import { OrderModule } from '~/domains/order/order.module';
import { PaymentModule } from '~/integrations/payment/payment.module';
import { QueueModule } from '~/integrations/queue/queue.module';
import { StripeWebhookController } from './api/rest/stripe-webhook.controller';
import { HandleStripeWebhookUseCase } from './app/use-cases/handle-stripe-webhook/handle-stripe-webhook.use-case';

@Module({
  imports: [
    PaymentModule,
    QueueModule,
    OrderModule,
    FinanceModule,
  ],
  controllers: [StripeWebhookController],
  providers: [HandleStripeWebhookUseCase],
})
export class PaymentsWebhookModule {}
