import { Injectable } from '@nestjs/common';
import { PaymentGateway } from '~/integrations/payment/app/ports/payment-gateway';
import type { AppJobPayloadMap } from '~/platform/jobs/app-job.types';
import { RecordProviderFeeUseCase } from '../app/use-cases/record-provider-fee/record-provider-fee.use-case';

type RecordProviderFeePayload = AppJobPayloadMap['finance.record-provider-fee'];

/**
 * The audit actor of a fee that arrives from a provider webhook. There is no
 * user in that path, so the recording names the system actor instead of
 * borrowing a real user id.
 */
export const STRIPE_WEBHOOK_ACTOR = 'system:stripe-webhook';

export const STRIPE_PROVIDER = 'stripe';

/**
 * Ingests the fee a Stripe webhook only referenced.
 *
 * The webhook enqueues the balance transaction id; this job reads the
 * provider's own record for the signed fee and records it. A transaction that
 * is not readable yet throws so BullMQ retries, which is safe because the fee
 * recorder is idempotent per `(provider, providerReference)`.
 */
@Injectable()
export class RecordProviderFeeJob {
  constructor(
    private readonly paymentGateway: PaymentGateway,
    private readonly recordProviderFeeUseCase: RecordProviderFeeUseCase,
  ) {}

  async run(payload: RecordProviderFeePayload): Promise<void> {
    const transaction = await this.paymentGateway.retrieveBalanceTransaction(
      payload.balanceTransactionId,
    );

    // A zero fee is a movement with no fee: there is nothing to expense, and
    // the recorder rejects zero by contract.
    if (transaction.feeMinor === 0) {
      return;
    }

    await this.recordProviderFeeUseCase.execute({
      provider: STRIPE_PROVIDER,
      providerReference: transaction.id,
      currency: transaction.currency.toUpperCase(),
      amountMinor: transaction.feeMinor,
      occurredAt: transaction.createdAt,
      actorId: STRIPE_WEBHOOK_ACTOR,
    });
  }
}
