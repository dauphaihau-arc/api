import { Injectable, Logger } from '@nestjs/common';
import type { ConnectedPayoutStatus } from '../../../domain/rules/provider-evidence';
import { ProviderEvidenceRepository } from '../../ports/provider-evidence.repository';

export interface RecordConnectedPayoutInput {
  providerPayoutId: string;
  /** `event.account`, the connected account the payout belongs to. */
  accountId: string | null;
  status: ConnectedPayoutStatus;
  amountMinor: number;
  currency: string;
  /** The provider's arrival day, `YYYY-MM-DD`. */
  arrivalDate: string;
  failureCode: string | null;
  occurredAt: Date;
}

export interface RecordConnectedPayoutResult {
  /** False when the provider payout was already stored and only updated. */
  created: boolean;
}

/**
 * Stores one connected-account `payout.paid`/`payout.failed` webhook.
 *
 * Stripe pays the connected account's bank on its own schedule, so this row is
 * the only record of that payout. The row is upserted by provider payout id: a
 * payout reported `failed` and later `paid` keeps one row that reflects the
 * latest report.
 *
 * A payout for an account this deployment does not store is kept rather than
 * ignored, because reconciliation needs the provider record even when the shop
 * cannot be identified. The column has no foreign key for the same reason.
 * Nothing here posts to the ledger; the platform transfer is the ledger fact.
 */
@Injectable()
export class RecordConnectedPayoutUseCase {
  private readonly logger = new Logger(RecordConnectedPayoutUseCase.name);

  constructor(
    private readonly providerEvidenceRepository: ProviderEvidenceRepository,
  ) {}

  async execute(
    input: RecordConnectedPayoutInput,
  ): Promise<RecordConnectedPayoutResult> {
    const providerPayoutId = input.providerPayoutId.trim();
    const currency = input.currency.trim().toUpperCase();

    const created = await this.providerEvidenceRepository.upsertConnectedPayout({
      providerPayoutId,
      providerAccountId: input.accountId,
      status: input.status,
      amountMinor: input.amountMinor,
      currency,
      arrivalDate: input.arrivalDate,
      failureCode: input.status === 'failed' ? input.failureCode : null,
      occurredAt: input.occurredAt,
    });

    this.logger.debug(
      created
        ? `Connected payout ${providerPayoutId} recorded as ${input.status}`
        : `Connected payout ${providerPayoutId} updated to ${input.status}`,
    );

    return { created };
  }
}
