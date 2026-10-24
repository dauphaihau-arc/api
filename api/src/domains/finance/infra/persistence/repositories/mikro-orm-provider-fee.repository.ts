import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { FinanceRepositoryContext } from '../../../app/ports/finance-repository-context';
import {
  ProviderFeeRepository,
  type InsertProviderFeeInput,
  type ProviderFeeRecord,
} from '../../../app/ports/provider-fee.repository';

interface ProviderFeeRow {
  id: string;
  provider: string;
  providerReference: string;
  currency: string;
  amountMinor: number;
  occurredAt: Date;
  recordedAt: Date;
  journalEntryId: string;
  journalEntryKey: string;
}

const PROVIDER_FEE_SELECT = `
  select f."id" as "id",
         f."provider" as "provider",
         f."provider_reference" as "providerReference",
         f."currency" as "currency",
         f."amount_minor" as "amountMinor",
         f."occurred_at" as "occurredAt",
         f."recorded_at" as "recordedAt",
         f."journal_entry_id" as "journalEntryId",
         je."money_event_key" as "journalEntryKey"
  from "provider_fees" f
  join "journal_entries" je on je."id" = f."journal_entry_id"
`;

/** Records and reads the fees the payment provider charged the platform. */
@Injectable()
export class MikroOrmProviderFeeRepository implements ProviderFeeRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async lockProviderReference(
    provider: string,
    providerReference: string,
    context: FinanceRepositoryContext,
  ): Promise<void> {
    // A transaction-scoped advisory lock: it is released when the caller's
    // transaction ends, so the lookup-then-insert pair cannot interleave with
    // another recording of the same provider charge.
    await this.getEntityManager(context).execute(
      'select pg_advisory_xact_lock(hashtext(?))',
      [`provider.fee:${provider}:${providerReference}`],
    );
  }

  async findByProviderReference(
    provider: string,
    providerReference: string,
    context?: FinanceRepositoryContext,
  ): Promise<ProviderFeeRecord | null> {
    const rows = await this.getEntityManager(context).execute<ProviderFeeRow[]>(
      `${PROVIDER_FEE_SELECT}
       where f."provider" = ? and f."provider_reference" = ?
       limit 1`,
      [provider, providerReference],
    );

    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async insert(
    input: InsertProviderFeeInput,
    context: FinanceRepositoryContext,
  ): Promise<ProviderFeeRecord> {
    await this.getEntityManager(context).execute(
      `insert into "provider_fees" (
         "id", "created_at", "updated_at", "provider", "provider_reference",
         "currency", "amount_minor", "occurred_at", "journal_entry_id",
         "recorded_at"
       )
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.recordedAt,
        input.recordedAt,
        input.provider,
        input.providerReference,
        input.currency,
        input.amountMinor,
        input.occurredAt,
        input.journalEntryId,
        input.recordedAt,
      ],
    );

    return {
      id: input.id,
      provider: input.provider,
      providerReference: input.providerReference,
      currency: input.currency,
      amountMinor: input.amountMinor,
      occurredAt: input.occurredAt,
      recordedAt: input.recordedAt,
      journalEntryId: input.journalEntryId,
      journalEntryKey: `provider.fee:${input.id}`,
    };
  }

  private toRecord(row: ProviderFeeRow): ProviderFeeRecord {
    return {
      id: row.id,
      provider: row.provider,
      providerReference: row.providerReference,
      currency: row.currency,
      amountMinor: Number(row.amountMinor),
      occurredAt: new Date(row.occurredAt),
      recordedAt: new Date(row.recordedAt),
      journalEntryId: row.journalEntryId,
      journalEntryKey: row.journalEntryKey,
    };
  }

  private getEntityManager(context?: FinanceRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
