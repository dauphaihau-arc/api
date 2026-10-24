import type { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import type { PaymentWebhookEvent } from '~/integrations/payment/app/ports/payment-gateway';
import type { OrderPaymentService } from '../../services/order-payment.service';
import type { OrderRefundService } from '../../services/order-refund.service';
import { HandleStripeWebhookUseCase } from './handle-stripe-webhook.use-case';

describe('HandleStripeWebhookUseCase', () => {
  function buildUseCase() {
    const orderPaymentService = {
      markCheckoutSessionCompleted: jest.fn(),
      markCheckoutSessionExpired: jest.fn(),
    };
    const orderRefundService = {
      applyProviderRefund: jest.fn(),
    };
    const jobDispatcher = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };

    return {
      useCase: new HandleStripeWebhookUseCase(
        orderPaymentService as unknown as OrderPaymentService,
        orderRefundService as unknown as OrderRefundService,
        jobDispatcher as unknown as JobDispatcher,
      ),
      orderPaymentService,
      orderRefundService,
      jobDispatcher,
    };
  }

  it('dispatches fee ingestion for a paid charge', async () => {
    const { useCase, jobDispatcher } = buildUseCase();
    const event: PaymentWebhookEvent = {
      id: 'evt_1',
      type: 'charge.succeeded',
      data: {
        object: { chargeId: 'ch_1', balanceTransactionId: 'txn_1' },
      },
    };

    await useCase.execute(event);

    expect(jobDispatcher.dispatch).toHaveBeenCalledTimes(1);
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      'finance.record-provider-fee',
      { balanceTransactionId: 'txn_1' },
    );
  });

  it('dispatches fee ingestion for a refunded charge', async () => {
    const { useCase, jobDispatcher } = buildUseCase();
    const event: PaymentWebhookEvent = {
      id: 'evt_2',
      type: 'charge.refunded',
      data: {
        object: { chargeId: 'ch_1', balanceTransactionId: 'txn_refund' },
      },
    };

    await useCase.execute(event);

    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      'finance.record-provider-fee',
      { balanceTransactionId: 'txn_refund' },
    );
  });

  it('dispatches fee ingestion for charge.updated, which carries the balance transaction', async () => {
    // Stripe sends charge.succeeded with a null balance_transaction and fills
    // it on the following charge.updated; the fee only exists on the latter.
    const { useCase, jobDispatcher } = buildUseCase();
    const event: PaymentWebhookEvent = {
      id: 'evt_2b',
      type: 'charge.updated',
      data: {
        object: { chargeId: 'ch_1', balanceTransactionId: 'txn_updated' },
      },
    };

    await useCase.execute(event);

    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      'finance.record-provider-fee',
      { balanceTransactionId: 'txn_updated' },
    );
  });

  it('does not dispatch when a charge carries no balance transaction', async () => {
    const { useCase, jobDispatcher } = buildUseCase();
    const event: PaymentWebhookEvent = {
      id: 'evt_3',
      type: 'charge.succeeded',
      data: {
        object: { chargeId: 'ch_1', balanceTransactionId: null },
      },
    };

    await useCase.execute(event);

    expect(jobDispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('applies a refund and then dispatches its fee', async () => {
    const { useCase, jobDispatcher, orderRefundService } = buildUseCase();
    const event: PaymentWebhookEvent = {
      id: 'evt_4',
      type: 'refund.updated',
      data: {
        object: {
          id: 're_1',
          paymentIntentId: 'pi_1',
          status: 'succeeded',
          amount: 2500,
          failureReason: null,
          balanceTransactionId: 'txn_2',
        },
      },
    };

    await useCase.execute(event);

    expect(orderRefundService.applyProviderRefund).toHaveBeenCalledWith({
      providerRefundId: 're_1',
      paymentIntentId: 'pi_1',
      status: 'succeeded',
      amountMinor: 2500,
      failureReason: null,
    });
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      'finance.record-provider-fee',
      { balanceTransactionId: 'txn_2' },
    );
  });

  it('applies a refund but dispatches nothing when its balance transaction is null', async () => {
    const { useCase, jobDispatcher, orderRefundService } = buildUseCase();
    const event: PaymentWebhookEvent = {
      id: 'evt_5',
      type: 'refund.failed',
      data: {
        object: {
          id: 're_2',
          paymentIntentId: 'pi_1',
          status: 'failed',
          amount: 2500,
          failureReason: 'expired_or_canceled_card',
          balanceTransactionId: null,
        },
      },
    };

    await useCase.execute(event);

    expect(orderRefundService.applyProviderRefund).toHaveBeenCalledTimes(1);
    expect(jobDispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('dispatches one fee job per dispute balance transaction', async () => {
    const { useCase, jobDispatcher } = buildUseCase();
    const event: PaymentWebhookEvent = {
      id: 'evt_6',
      type: 'charge.dispute.created',
      data: {
        object: {
          disputeId: 'du_1',
          balanceTransactionIds: ['txn_dispute_1', 'txn_dispute_2'],
        },
      },
    };

    await useCase.execute(event);

    expect(jobDispatcher.dispatch).toHaveBeenCalledTimes(2);
    expect(jobDispatcher.dispatch).toHaveBeenNthCalledWith(
      1,
      'finance.record-provider-fee',
      { balanceTransactionId: 'txn_dispute_1' },
    );
    expect(jobDispatcher.dispatch).toHaveBeenNthCalledWith(
      2,
      'finance.record-provider-fee',
      { balanceTransactionId: 'txn_dispute_2' },
    );
  });

  it('still handles checkout sessions without touching fees', async () => {
    const { useCase, orderPaymentService, jobDispatcher } = buildUseCase();
    const event: PaymentWebhookEvent = {
      id: 'evt_7',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          status: 'complete',
          paymentStatus: 'paid',
          paymentIntentId: 'pi_1',
        },
      },
    };

    await useCase.execute(event);

    expect(orderPaymentService.markCheckoutSessionCompleted).toHaveBeenCalledWith(
      'cs_1',
      expect.objectContaining({ paymentIntentId: 'pi_1', paymentStatus: 'paid' }),
    );
    expect(jobDispatcher.dispatch).not.toHaveBeenCalled();
  });
});
