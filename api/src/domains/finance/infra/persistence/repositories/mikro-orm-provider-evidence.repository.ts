import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { FinanceRepositoryContext } from '../../../app/ports/finance-repository-context';
import {
  ProviderEvidenceRepository,
  type InsertProviderTransferEventInput,
  type UpsertConnectedPayoutInput,
} from '../../../app/ports/provider-evidence.repository';

interface PayoutReferenceRow {
  id: string;
}

interface InsertedRow {
  id: string;
}

interface UpsertedRow {
  inserted: boolean;
}

/**
 * Persists provider transfer and connected-payout webhook evidence.
 *
 * Both writes are single statements, so the database's unique constraints are
 * the idempotency mechanism: `provider_event_id` makes a transfer-event replay
 * a no-op, and `provider_payout_id` makes a repeated connected payout update
 * the same row. No advisory lock is needed because there is no
 * read-then-write pair to interleave.
 */
@Injectable()
export class MikroOrmProviderEvidenceRepository
implements ProviderEvidenceRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findPayoutIdByProviderReference(
    providerReference: string,
    context?: FinanceRepositoryContext,
  ): Promise<string | null> {
    const rows = await this.getEntityManager(context).execute<PayoutReferenceRow[]>(
      `select "id"
       from "payouts"
       where "provider_reference" = ?
       order by "created_at" asc
       limit 1`,
      [providerReference],
    );

    return rows[0]?.id ?? null;
  }

  async insertTransferEventIfAbsent(
    input: InsertProviderTransferEventInput,
    context?: FinanceRepositoryContext,
  ): Promise<boolean> {
    const rows = await this.getEntityManager(context).execute<InsertedRow[]>(
      `insert into "provider_transfer_events" (
         "id", "created_at", "updated_at", "provider_event_id", "transfer_id",
         "payout_id", "status", "amount_minor", "currency",
         "reversed_amount_minor", "destination_account_id", "occurred_at"
       )
       values (
         ?, now(), now(), ?, ?, ?, ?, ?, ?, ?, ?, ?
       )
       on conflict ("provider_event_id") do nothing
       returning "id"`,
      [
        randomUUID(),
        input.providerEventId,
        input.transferId,
        input.payoutId,
        input.status,
        input.amountMinor,
        input.currency,
        input.reversedAmountMinor,
        input.destinationAccountId,
        input.occurredAt,
      ],
    );

    return rows.length > 0;
  }

  async upsertConnectedPayout(
    input: UpsertConnectedPayoutInput,
    context?: FinanceRepositoryContext,
  ): Promise<boolean> {
    // `xmax = 0` distinguishes the inserted row from the conflicting one this
    // statement updated, without a second round trip. The `where` keeps a
    // provider report that arrives late from overwriting a newer outcome.
    const rows = await this.getEntityManager(context).execute<UpsertedRow[]>(
      `insert into "connected_payouts" (
         "id", "created_at", "updated_at", "provider_payout_id",
         "provider_account_id", "status", "amount_minor", "currency",
         "arrival_date", "failure_code", "occurred_at"
       )
       values (
         ?, now(), now(), ?, ?, ?, ?, ?, ?, ?, ?
       )
       on conflict ("provider_payout_id") do update set
         "provider_account_id" = excluded."provider_account_id",
         "status" = excluded."status",
         "amount_minor" = excluded."amount_minor",
         "currency" = excluded."currency",
         "arrival_date" = excluded."arrival_date",
         "failure_code" = excluded."failure_code",
         "occurred_at" = excluded."occurred_at",
         "updated_at" = now()
       where excluded."occurred_at" >= "connected_payouts"."occurred_at"
       returning (xmax = 0) as "inserted"`,
      [
        randomUUID(),
        input.providerPayoutId,
        input.providerAccountId,
        input.status,
        input.amountMinor,
        input.currency,
        input.arrivalDate,
        input.failureCode,
        input.occurredAt,
      ],
    );

    return rows[0]?.inserted === true;
  }

  private getEntityManager(context?: FinanceRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
