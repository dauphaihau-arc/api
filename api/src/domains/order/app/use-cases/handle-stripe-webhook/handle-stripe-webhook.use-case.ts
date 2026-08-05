import { Injectable } from '@nestjs/common';
import type {
  CheckoutSessionDetails,
  PaymentWebhookEvent,
} from '~/integrations/payment/app/ports/payment-gateway';
import { OrderPaymentService } from '../../services/order-payment.service';

@Injectable()
export class HandleStripeWebhookUseCase {
  constructor(private readonly orderPaymentService: OrderPaymentService) {}

  async execute(event: PaymentWebhookEvent): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as CheckoutSessionDetails;
        await this.orderPaymentService.markCheckoutSessionCompleted(session.id, {
          paymentIntentId: session.paymentIntentId,
          paymentStatus: session.paymentStatus,
          completedAt: new Date(),
        });
        return;
      }
      case 'checkout.session.expired': {
        const session = event.data.object as CheckoutSessionDetails;
        await this.orderPaymentService.markCheckoutSessionExpired(
          session.id,
          session.expiresAt,
        );
        return;
      }
      default:
        return;
    }
  }
}
