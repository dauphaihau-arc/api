import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import { Clock } from '~/platform/time/clock';
import {
  PROVIDER_FEE_MONEY_EVENT_KIND,
  buildProviderFeePostings,
  providerFeeMoneyEventKey,
} from '../../../domain/rules/provider-fee';
import { JournalEntryRepository } from '../../ports/journal-entry.repository';
import {
  ProviderFeeRepository,
  type ProviderFeeRecord,
} from '../../ports/provider-fee.repository';

export interface RecordProviderFeeInput {
  /** The payment provider that charged the fee, e.g. `stripe`. */
  provider: string;

  /** The provider's own id for the charge. Unique per provider. */
  providerReference: string;

  currency: string;

  /**
   * The signed fee in minor units: positive is a fee the provider charged,
   * negative reverses a previously charged fee.
   */
  amountMinor: number;

  occurredAt: Date;

  /**
   * The audit actor that observed the fee, e.g. `system:stripe-webhook`.
   * Audit-only: no user is stored on the fee row itself.
   */
  actorId: string;
}

/** Where a recorded fee came from. Only the provider feed writes new rows. */
const PROVIDER_FEE_SOURCE = 'webhook' as const;

type ProviderFeeSource = typeof PROVIDER_FEE_SOURCE;

export interface RecordProviderFeeResult {
  fee: ProviderFeeRecord;
  /** True when this request found the charge already recorded and wrote nothing. */
  replayed: boolean;
}

/**
 * Records one fee the payment provider charged the platform, from the
 * provider's own record, or a negative fee the provider reversed.
 *
 * In one transaction it inserts the `provider_fees` row and appends its
 * Journal Entry keyed by the fee's own id (`provider.fee:<feeId>`): the entry
 * debits Platform Fee and credits Platform Clearing, so the fee is platform
 * expense and no shop's Seller Payable is touched.
 *
 * `(provider, providerReference)` identifies the charge, so a retried webhook
 * returns the fee already recorded rather than expensing it twice. A transaction-scoped
 * advisory lock serializes the lookup and insert for one reference, which is
 * what keeps two concurrent recordings from writing two entries.
 */
@Injectable()
export class RecordProviderFeeUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly journalEntryRepository: JournalEntryRepository,
    private readonly providerFeeRepository: ProviderFeeRepository,
    private readonly auditLogService: AuditLogService,
    private readonly clock: Clock,
  ) {}

  async execute(input: RecordProviderFeeInput): Promise<RecordProviderFeeResult> {
    const provider = input.provider.trim();
    const providerReference = input.providerReference.trim();
    const currency = input.currency.trim().toUpperCase();
    const actorId = input.actorId.trim();
    const source: ProviderFeeSource = PROVIDER_FEE_SOURCE;

    const postings = buildProviderFeePostings({
      currency,
      amountMinor: input.amountMinor,
    });

    const now = this.clock.now();
    const feeId = randomUUID();
    const moneyEventKey = providerFeeMoneyEventKey(feeId);

    const result = await this.entityManager.transactional(async (entityManager) => {
      const context = { entityManager };

      await this.providerFeeRepository.lockProviderReference(
        provider,
        providerReference,
        context,
      );

      const existing = await this.providerFeeRepository.findByProviderReference(
        provider,
        providerReference,
        context,
      );

      if (existing) {
        return { fee: existing, replayed: true };
      }

      const recorded = await this.journalEntryRepository.append(
        {
          moneyEventKey,
          moneyEventKind: PROVIDER_FEE_MONEY_EVENT_KIND,
          currency,
          occurredAt: input.occurredAt,
          postings,
        },
        context,
      );

      if (!recorded) {
        // The fee id is freshly generated, so a conflict can only mean the same
        // entry was already written; refusing keeps the ledger honest.
        throw new Error(`Journal Entry ${moneyEventKey} already exists`);
      }

      const journalEntryId = await this.journalEntryRepository
        .findIdByMoneyEventKey(moneyEventKey, context);

      if (!journalEntryId) {
        throw new Error(`Journal Entry ${moneyEventKey} was not persisted`);
      }

      const fee = await this.providerFeeRepository.insert(
        {
          id: feeId,
          provider,
          providerReference,
          currency,
          amountMinor: input.amountMinor,
          occurredAt: input.occurredAt,
          recordedAt: now,
          journalEntryId,
        },
        context,
      );

      return { fee, replayed: false };
    });

    if (!result.replayed) {
      await this.auditLogService.record({
        action: 'finance.provider_fee.recorded',
        entityType: 'provider_fee',
        entityId: result.fee.id,
        entityPublicId: result.fee.id,
        actor: { actorId },
        summary: {
          source,
          provider,
          providerReference,
          currency,
          amountMinor: input.amountMinor,
          occurredAt: input.occurredAt.toISOString(),
          journalEntryKey: result.fee.journalEntryKey,
        },
      });
    }

    return result;
  }
}
