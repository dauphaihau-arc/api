import type { PaymentGateway } from '~/integrations/payment/app/ports/payment-gateway';
import type { RecordProviderFeeUseCase } from '../app/use-cases/record-provider-fee/record-provider-fee.use-case';
import {
  RecordProviderFeeJob,
  STRIPE_WEBHOOK_ACTOR,
} from './record-provider-fee.job';

describe('RecordProviderFeeJob', () => {
  const balanceTransaction = {
    id: 'txn_123',
    amountMinor: 1189,
    feeMinor: 189,
    netMinor: 1000,
    currency: 'USD',
    createdAt: new Date('2026-10-23T09:15:00.000Z'),
  };

  function buildJob(feeMinor: number) {
    const paymentGateway = {
      retrieveBalanceTransaction: jest.fn().mockResolvedValue({
        ...balanceTransaction,
        feeMinor,
      }),
    };
    const recordProviderFeeUseCase = {
      execute: jest.fn().mockResolvedValue({ fee: {}, replayed: false }),
    };

    return {
      job: new RecordProviderFeeJob(
        paymentGateway as unknown as PaymentGateway,
        recordProviderFeeUseCase as unknown as RecordProviderFeeUseCase,
      ),
      paymentGateway,
      recordProviderFeeUseCase,
    };
  }

  it('records the signed fee from the provider balance transaction', async () => {
    const { job, recordProviderFeeUseCase } = buildJob(189);

    await job.run({ balanceTransactionId: 'txn_123' });

    expect(recordProviderFeeUseCase.execute).toHaveBeenCalledWith({
      provider: 'stripe',
      providerReference: 'txn_123',
      currency: 'USD',
      amountMinor: 189,
      occurredAt: new Date('2026-10-23T09:15:00.000Z'),
      actorId: STRIPE_WEBHOOK_ACTOR,
    });
  });

  it('records a negative reversal fee with its sign intact', async () => {
    const { job, recordProviderFeeUseCase } = buildJob(-189);

    await job.run({ balanceTransactionId: 'txn_123' });

    expect(recordProviderFeeUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: -189 }),
    );
  });

  it('no-ops on a zero fee, which the recorder refuses', async () => {
    const { job, recordProviderFeeUseCase } = buildJob(0);

    await job.run({ balanceTransactionId: 'txn_123' });

    expect(recordProviderFeeUseCase.execute).not.toHaveBeenCalled();
  });

  it('propagates a provider read failure so the queue retries', async () => {
    const { job, paymentGateway } = buildJob(189);
    paymentGateway.retrieveBalanceTransaction.mockRejectedValue(
      new Error('balance transaction is not ready'),
    );

    await expect(job.run({ balanceTransactionId: 'txn_missing' })).rejects.toThrow(
      'balance transaction is not ready',
    );
  });
});
