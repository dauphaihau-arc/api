import type { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import type { PaymentWebhookEvent } from '~/integrations/payment/app/ports/payment-gateway';
import {
  ConnectAccountNotFoundError,
  type ConnectGateway,
} from '~/integrations/payment/app/ports/connect-gateway';
import type { SyncPayoutAccountUseCase } from '~/domains/finance/app/use-cases/sync-payout-account/sync-payout-account.use-case';
import type { RecordTransferEventUseCase } from '~/domains/finance/app/use-cases/record-transfer-event/record-transfer-event.use-case';
import type { RecordConnectedPayoutUseCase } from '~/domains/finance/app/use-cases/record-connected-payout/record-connected-payout.use-case';
import type { OrderPaymentService } from '~/domains/order/app/services/order-payment.service';
import type { OrderRefundService } from '~/domains/order/app/services/order-refund.service';
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
    const syncPayoutAccountUseCase = {
      execute: jest.fn().mockResolvedValue(null),
    };
    const recordTransferEventUseCase = {
      execute: jest.fn().mockResolvedValue({ recorded: true, payoutId: null }),
    };
    const recordConnectedPayoutUseCase = {
      execute: jest.fn().mockResolvedValue({ created: true }),
    };
    const jobDispatcher = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };
    const connectGateway = {
      retrieveAccount: jest.fn().mockRejectedValue(
        new Error('retrieveAccount was not expected'),
      ),
      createAccount: jest.fn(),
      createAccountLink: jest.fn(),
    };

    return {
      useCase: new HandleStripeWebhookUseCase(
        orderPaymentService as unknown as OrderPaymentService,
        orderRefundService as unknown as OrderRefundService,
        syncPayoutAccountUseCase as unknown as SyncPayoutAccountUseCase,
        recordTransferEventUseCase as unknown as RecordTransferEventUseCase,
        recordConnectedPayoutUseCase as unknown as RecordConnectedPayoutUseCase,
        jobDispatcher as unknown as JobDispatcher,
        connectGateway as unknown as ConnectGateway,
      ),
      orderPaymentService,
      orderRefundService,
      syncPayoutAccountUseCase,
      recordTransferEventUseCase,
      recordConnectedPayoutUseCase,
      jobDispatcher,
      connectGateway,
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

  it('syncs a connected account from account.updated', async () => {
    const { useCase, syncPayoutAccountUseCase } = buildUseCase();
    const account = {
      id: 'acct_1',
      country: 'US',
      defaultCurrency: 'USD',
      payoutsEnabled: true,
      chargesEnabled: true,
      transfersCapability: 'active',
      requirementsDue: [],
      disabledReason: null,
    };
    const event: PaymentWebhookEvent = {
      id: 'evt_8',
      type: 'account.updated',
      account: 'acct_1',
      data: { object: account },
    };

    await useCase.execute(event);

    expect(syncPayoutAccountUseCase.execute).toHaveBeenCalledWith({ account });
  });

  it('ignores a Connect event whose event account does not match its object', async () => {
    const { useCase, syncPayoutAccountUseCase } = buildUseCase();
    const event: PaymentWebhookEvent = {
      id: 'evt_9',
      type: 'account.updated',
      account: 'acct_other',
      data: {
        object: {
          id: 'acct_1',
          country: 'US',
          defaultCurrency: 'USD',
          payoutsEnabled: true,
          chargesEnabled: true,
          transfersCapability: 'active',
          requirementsDue: [],
          disabledReason: null,
        },
      },
    };

    await useCase.execute(event);

    expect(syncPayoutAccountUseCase.execute).not.toHaveBeenCalled();
  });

  it('re-reads the account for capability.updated before syncing it', async () => {
    const { useCase, connectGateway, syncPayoutAccountUseCase } = buildUseCase();
    const account = {
      id: 'acct_1',
      country: 'US',
      defaultCurrency: 'USD',
      payoutsEnabled: true,
      chargesEnabled: true,
      transfersCapability: 'active',
      requirementsDue: [],
      disabledReason: null,
    };
    connectGateway.retrieveAccount.mockResolvedValue(account);
    const event: PaymentWebhookEvent = {
      id: 'evt_cap_1',
      type: 'capability.updated',
      account: 'acct_1',
      data: { object: { accountId: 'acct_1' } },
    };

    await useCase.execute(event);

    expect(connectGateway.retrieveAccount).toHaveBeenCalledWith('acct_1');
    expect(syncPayoutAccountUseCase.execute).toHaveBeenCalledWith({ account });
  });

  it('re-reads the account for person.updated before syncing it', async () => {
    const { useCase, connectGateway, syncPayoutAccountUseCase } = buildUseCase();
    const account = {
      id: 'acct_1',
      country: 'US',
      defaultCurrency: 'USD',
      payoutsEnabled: true,
      chargesEnabled: true,
      transfersCapability: 'active',
      requirementsDue: [],
      disabledReason: null,
    };
    connectGateway.retrieveAccount.mockResolvedValue(account);
    const event: PaymentWebhookEvent = {
      id: 'evt_person_1',
      type: 'person.updated',
      account: 'acct_1',
      data: { object: { accountId: 'acct_1' } },
    };

    await useCase.execute(event);

    expect(connectGateway.retrieveAccount).toHaveBeenCalledWith('acct_1');
    expect(syncPayoutAccountUseCase.execute).toHaveBeenCalledWith({ account });
  });

  it('falls back to the event account when the object names none', async () => {
    const { useCase, connectGateway, syncPayoutAccountUseCase } = buildUseCase();
    connectGateway.retrieveAccount.mockResolvedValue({ id: 'acct_9' });
    const event: PaymentWebhookEvent = {
      id: 'evt_cap_2',
      type: 'capability.updated',
      account: 'acct_9',
      data: { object: { accountId: null } },
    };

    await useCase.execute(event);

    expect(connectGateway.retrieveAccount).toHaveBeenCalledWith('acct_9');
    expect(syncPayoutAccountUseCase.execute).toHaveBeenCalledWith({
      account: { id: 'acct_9' },
    });
  });

  it('ignores a change event for an account Stripe does not have', async () => {
    const { useCase, connectGateway, syncPayoutAccountUseCase } = buildUseCase();
    connectGateway.retrieveAccount.mockRejectedValue(
      new ConnectAccountNotFoundError('acct_unknown'),
    );
    const event: PaymentWebhookEvent = {
      id: 'evt_cap_3',
      type: 'capability.updated',
      account: 'acct_unknown',
      data: { object: { accountId: 'acct_unknown' } },
    };

    await expect(useCase.execute(event)).resolves.toBeUndefined();
    expect(syncPayoutAccountUseCase.execute).not.toHaveBeenCalled();
  });

  it('rethrowns a transient provider read failure so the webhook retries', async () => {
    const { useCase, connectGateway, syncPayoutAccountUseCase } = buildUseCase();
    connectGateway.retrieveAccount.mockRejectedValue(new Error('Stripe is down'));
    const event: PaymentWebhookEvent = {
      id: 'evt_person_2',
      type: 'person.updated',
      account: 'acct_1',
      data: { object: { accountId: 'acct_1' } },
    };

    await expect(useCase.execute(event)).rejects.toThrow('Stripe is down');
    expect(syncPayoutAccountUseCase.execute).not.toHaveBeenCalled();
  });

  it('records a transfer event as provider evidence', async () => {
    const { useCase, recordTransferEventUseCase } = buildUseCase();
    const occurredAt = new Date('2026-10-24T10:00:00.000Z');
    const event: PaymentWebhookEvent = {
      id: 'evt_tr_1',
      type: 'transfer.reversed',
      account: 'acct_1',
      data: {
        object: {
          transferId: 'tr_1',
          amountMinor: 12_500,
          currency: 'USD',
          destinationAccountId: 'acct_1',
          reversedAmountMinor: 2_500,
          status: 'reversed',
          occurredAt,
        },
      },
    };

    await useCase.execute(event);

    expect(recordTransferEventUseCase.execute).toHaveBeenCalledWith({
      providerEventId: 'evt_tr_1',
      transferId: 'tr_1',
      amountMinor: 12_500,
      currency: 'USD',
      destinationAccountId: 'acct_1',
      reversedAmountMinor: 2_500,
      status: 'reversed',
      occurredAt,
    });
  });

  it('records a connected payout event as provider evidence', async () => {
    const { useCase, recordConnectedPayoutUseCase } = buildUseCase();
    const occurredAt = new Date('2026-10-24T10:00:00.000Z');
    const event: PaymentWebhookEvent = {
      id: 'evt_po_1',
      type: 'payout.paid',
      account: 'acct_1',
      data: {
        object: {
          payoutId: 'po_1',
          accountId: 'acct_1',
          status: 'paid',
          amountMinor: 12_500,
          currency: 'USD',
          arrivalDate: '2026-10-25',
          failureCode: null,
          occurredAt,
        },
      },
    };

    await useCase.execute(event);

    expect(recordConnectedPayoutUseCase.execute).toHaveBeenCalledWith({
      providerPayoutId: 'po_1',
      accountId: 'acct_1',
      status: 'paid',
      amountMinor: 12_500,
      currency: 'USD',
      arrivalDate: '2026-10-25',
      failureCode: null,
      occurredAt,
    });
  });
});
