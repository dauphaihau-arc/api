import { Injectable } from '@nestjs/common';
import type Stripe from 'stripe';
import { OrderPaymentService } from '../../services/order-payment.service';

@Injectable()
export class HandleStripeWebhookUseCase {
  constructor(private readonly orderPaymentService: OrderPaymentService) {}

  async execute(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.orderPaymentService.markCheckoutSessionCompleted(session.id, {
          paymentIntentId: session.payment_intent?.toString(),
          paymentStatus: session.payment_status,
          completedAt: new Date(),
        });
        return;
      }
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.orderPaymentService.markCheckoutSessionExpired(
          session.id,
          session.expires_at ? new Date(session.expires_at * 1000) : undefined,
        );
        return;
      }
      default:
        return;
    }
  }
}
