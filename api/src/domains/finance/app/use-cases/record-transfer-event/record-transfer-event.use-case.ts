import { Injectable, Logger } from '@nestjs/common';
import type { ProviderTransferEventStatus } from '../../../domain/rules/provider-evidence';
import { ProviderEvidenceRepository } from '../../ports/provider-evidence.repository';

export interface RecordTransferEventInput {
  /** Stripe's event id, the idempotency key for this evidence row. */
  providerEventId: string;
  transferId: string;
  amountMinor: number;
  currency: string;
  destinationAccountId: string | null;
  /** The sum of the transfer's reversals, in minor units. */
  reversedAmountMinor: number;
  status: ProviderTransferEventStatus;
  occurredAt: Date;
}

export interface RecordTransferEventResult {
  /** False when the provider event was already stored. */
  recorded: boolean;
  /** The Payout matched through `provider_reference`, if it is already known. */
  payoutId: string | null;
}

/**
 * Stores one `transfer.*` webhook as provider evidence.
 *
 * The row is matched to a Payout through `payouts.provider_reference`, which is
 * the transfer id the payout adapter stored on settle. A transfer event that
 * arrives before the transfer id is persisted stays unmatched (null payout) and
 * remains readable by transfer id, so the evidence is never dropped.
 *
 * This is evidence only: it never posts to the ledger, changes a Payout's state,
 * or releases Seller Payable. A replayed provider event id inserts nothing.
 */
@Injectable()
export class RecordTransferEventUseCase {
  private readonly logger = new Logger(RecordTransferEventUseCase.name);

  constructor(
    private readonly providerEvidenceRepository: ProviderEvidenceRepository,
  ) {}

  async execute(
    input: RecordTransferEventInput,
  ): Promise<RecordTransferEventResult> {
    const providerEventId = input.providerEventId.trim();
    const transferId = input.transferId.trim();
    const currency = input.currency.trim().toUpperCase();

    const payoutId = await this.providerEvidenceRepository
      .findPayoutIdByProviderReference(transferId);

    const recorded = await this.providerEvidenceRepository
      .insertTransferEventIfAbsent({
        providerEventId,
        transferId,
        payoutId,
        status: input.status,
        amountMinor: input.amountMinor,
        currency,
        reversedAmountMinor: input.reversedAmountMinor,
        destinationAccountId: input.destinationAccountId,
        occurredAt: input.occurredAt,
      });

    if (!recorded) {
      this.logger.debug(
        `Transfer event ${providerEventId} was already recorded`,
      );

      return { recorded: false, payoutId };
    }

    if (!payoutId && input.status === 'reversed') {
      // A reversal of a transfer this deployment cannot link to a Payout is
      // worth an operator's attention; the evidence row is still stored.
      this.logger.warn(
        `Transfer ${transferId} was reversed but matches no Payout provider reference`,
      );
    }

    return { recorded: true, payoutId };
  }
}
