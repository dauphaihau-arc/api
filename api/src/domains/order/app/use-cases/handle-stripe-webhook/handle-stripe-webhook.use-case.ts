import { Injectable } from '@nestjs/common';
import type {
  CheckoutSessionDetails,
  PaymentWebhookEvent,
  RefundDetails,
} from '~/integrations/payment/app/ports/payment-gateway';
import { OrderRefundService } from '../../services/order-refund.service';
import { OrderPaymentService } from '../../services/order-payment.service';

@Injectable()
export class HandleStripeWebhookUseCase {
  constructor(
    private readonly orderPaymentService: OrderPaymentService,
    private readonly orderRefundService: OrderRefundService,
  ) {}

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
      case 'refund.created':
      case 'refund.updated':
      case 'refund.failed': {
        // The provider's own report is the refund's final outcome: creation only
        // acknowledges a request, and a refund can be pending at that point.
        const refund = event.data.object as RefundDetails;

        await this.orderRefundService.applyProviderRefund({
          providerRefundId: refund.id,
          paymentIntentId: refund.paymentIntentId,
          status: refund.status,
          amountMinor: refund.amount,
          failureReason: refund.failureReason,
        });
        return;
      }
      default:
        return;
    }
  }
}
