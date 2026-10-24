import { Injectable } from '@nestjs/common';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import type {
  ChargeBalanceTransactionReference,
  CheckoutSessionDetails,
  DisputeBalanceTransactionsReference,
  PaymentWebhookEvent,
  RefundDetails,
} from '~/integrations/payment/app/ports/payment-gateway';
import { appJobName } from '~/platform/jobs/app-job.names';
import { OrderRefundService } from '../../services/order-refund.service';
import { OrderPaymentService } from '../../services/order-payment.service';

@Injectable()
export class HandleStripeWebhookUseCase {
  constructor(
    private readonly orderPaymentService: OrderPaymentService,
    private readonly orderRefundService: OrderRefundService,
    private readonly jobDispatcher: JobDispatcher,
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

        await this.dispatchProviderFee(refund.balanceTransactionId);
        return;
      }
      case 'charge.succeeded':
      case 'charge.updated':
      case 'charge.refunded': {
        // The charge is already known from the Checkout Session; what these
        // events add is the balance transaction that carries its fee. Stripe
        // often has `balance_transaction: null` on `charge.succeeded` and fills
        // it on the following `charge.updated`, which is why both are handled.
        const charge = event.data.object as ChargeBalanceTransactionReference;

        await this.dispatchProviderFee(charge.balanceTransactionId);
        return;
      }
      case 'charge.dispute.created': {
        const dispute = event.data.object as DisputeBalanceTransactionsReference;

        // A dispute moves money in several balance transactions. Only the fee
        // ingestion is in scope here; dispute accounting is not.
        for (const balanceTransactionId of dispute.balanceTransactionIds) {
          await this.dispatchProviderFee(balanceTransactionId);
        }

        return;
      }
      default:
        return;
    }
  }

  /**
   * The webhook answers fast: it enqueues the fee ingestion instead of reading
   * the balance transaction and writing the ledger itself.
   */
  private async dispatchProviderFee(
    balanceTransactionId: string | null | undefined,
  ): Promise<void> {
    if (!balanceTransactionId) {
      return;
    }

    await this.jobDispatcher.dispatch(appJobName.recordProviderFee, {
      balanceTransactionId,
    });
  }
}
