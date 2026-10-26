import { Inject, Injectable, Logger } from '@nestjs/common';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import type {
  ChargeBalanceTransactionReference,
  CheckoutSessionDetails,
  ConnectAccountChangedEvent,
  ConnectedPayoutEventDetails,
  DisputeBalanceTransactionsReference,
  PaymentWebhookEvent,
  ProviderTransferEventDetails,
  RefundDetails,
} from '~/integrations/payment/app/ports/payment-gateway';
import {
  CONNECT_GATEWAY,
  ConnectAccountNotFoundError,
  type ConnectAccountDetails,
  type ConnectGateway,
} from '~/integrations/payment/app/ports/connect-gateway';
import { appJobName } from '~/platform/jobs/app-job.names';
import { SyncPayoutAccountUseCase } from '~/domains/finance/app/use-cases/sync-payout-account/sync-payout-account.use-case';
import { RecordTransferEventUseCase } from '~/domains/finance/app/use-cases/record-transfer-event/record-transfer-event.use-case';
import { RecordConnectedPayoutUseCase } from '~/domains/finance/app/use-cases/record-connected-payout/record-connected-payout.use-case';
import { OrderRefundService } from '~/domains/order/app/services/order-refund.service';
import { OrderPaymentService } from '~/domains/order/app/services/order-payment.service';

/**
 * Stripe exposes a single webhook endpoint, so this use case owns the routing of
 * provider events: order events are delegated to the order services and finance
 * events to the finance use cases. It lives in its own domain because it
 * orchestrates both.
 */
@Injectable()
export class HandleStripeWebhookUseCase {
  private readonly logger = new Logger(HandleStripeWebhookUseCase.name);

  constructor(
    private readonly orderPaymentService: OrderPaymentService,
    private readonly orderRefundService: OrderRefundService,
    private readonly syncPayoutAccountUseCase: SyncPayoutAccountUseCase,
    private readonly recordTransferEventUseCase: RecordTransferEventUseCase,
    private readonly recordConnectedPayoutUseCase: RecordConnectedPayoutUseCase,
    private readonly jobDispatcher: JobDispatcher,
    @Inject(CONNECT_GATEWAY)
    private readonly connectGateway: ConnectGateway,
  ) {}

  async execute(event: PaymentWebhookEvent): Promise<void> {
    switch (event.type) {
      case 'account.updated': {
        // A Connect account event names its account twice: on the event and on
        // the object. The sync ignores an account this deployment does not
        // store, so a webhook for another environment changes nothing here.
        const account = event.data.object as ConnectAccountDetails;

        if (event.account && event.account !== account.id) {
          return;
        }

        await this.syncPayoutAccountUseCase.execute({ account });
        return;
      }
      case 'capability.updated':
      case 'person.updated': {
        // These events report a change to a fragment Arc does not store, and
        // they can arrive before or after the `account.updated` that would
        // carry the resulting state. Re-reading the account makes the order
        // irrelevant: whatever is applied is the provider's current answer.
        const changed = event.data.object as ConnectAccountChangedEvent;
        const accountId = changed.accountId ?? event.account;

        if (accountId) {
          await this.resyncConnectAccount(accountId);
        }

        return;
      }
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
      case 'transfer.created':
      case 'transfer.updated':
      case 'transfer.reversed': {
        // Evidence for the reconciliation of platform transfers against
        // Payouts. Two idempotent writes at most, so the webhook stays fast
        // without a job; neither touches the ledger.
        const transfer = event.data.object as ProviderTransferEventDetails;

        await this.recordTransferEventUseCase.execute({
          providerEventId: event.id,
          transferId: transfer.transferId,
          amountMinor: transfer.amountMinor,
          currency: transfer.currency,
          destinationAccountId: transfer.destinationAccountId,
          reversedAmountMinor: transfer.reversedAmountMinor,
          status: transfer.status,
          occurredAt: transfer.occurredAt,
        });
        return;
      }
      case 'payout.paid':
      case 'payout.failed': {
        // Stripe paying the connected account's bank. One upsert by provider
        // payout id; the platform transfer, not this payout, is the ledger fact.
        const payout = event.data.object as ConnectedPayoutEventDetails;

        await this.recordConnectedPayoutUseCase.execute({
          providerPayoutId: payout.payoutId,
          accountId: payout.accountId,
          status: payout.status,
          amountMinor: payout.amountMinor,
          currency: payout.currency,
          arrivalDate: payout.arrivalDate,
          failureCode: payout.failureCode,
          occurredAt: payout.occurredAt,
        });
        return;
      }
      default:
        return;
    }
  }

  /**
   * Reads the account's current state and applies it. An account Stripe does
   * not have is ignored — it belongs to another environment or was deleted —
   * while any other provider failure is rethrown so Stripe retries the webhook
   * instead of the event being lost.
   */
  private async resyncConnectAccount(accountId: string): Promise<void> {
    let account: ConnectAccountDetails;

    try {
      account = await this.connectGateway.retrieveAccount(accountId);
    }
    catch (error) {
      if (error instanceof ConnectAccountNotFoundError) {
        this.logger.warn(
          `Ignoring a Connect event for unknown account ${accountId}`,
        );
        return;
      }

      throw error;
    }

    await this.syncPayoutAccountUseCase.execute({ account });
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
