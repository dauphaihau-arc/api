import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  PayoutCommandRepository,
  type BlockedPayoutInput,
  type ClaimPayoutInput,
  type ClaimPayoutResult,
  type FailPayoutInput,
  type PendingPayoutAttempt,
  type SettlePayoutInput,
} from '../../../app/ports/payout-command.repository';
import type {
  PayoutAllocation,
  PayoutSource,
} from '../../../domain/rules/payout';
import type { FinanceRepositoryContext } from '../../../app/ports/finance-repository-context';
import { toNullableMinorUnits } from './payout-row.mapper';

/** The claimed row's columns, as Postgres returns them. */
interface ClaimedPayoutRow {
  id: string;
  public_id: string;
  currency: string;
}

/** A `pending` row as the retry job reads it back. */
interface PendingPayoutRow {
  id: string;
  public_id: string;
  shop_id: string;
  payout_account_id: string;
  currency: string;
  amount_minor: number;
  source: PayoutSource;
  attempt_count: number;
  claimed_allocations: PayoutAllocation[] | null;
  source_currency: string | null;
  target_currency: string | null;
  transfer_currency: string | null;
  transfer_amount_minor: string | null;
  fx_rate: string | null;
  target_amount_minor: string | null;
  fx_fee_minor: string | null;
  provider_fx_rate: string | null;
}

/** The `reason` column's width. */
const REASON_MAX_LENGTH = 64;

/**
 * Persists claimed Payouts and their per-Order discharge lines. Raw SQL through
 * `entityManager.execute` so a write joins the caller's transaction, and
 * `on conflict do nothing` rather than a caught unique violation so a Postgres
 * error inside a caller's transaction never aborts it.
 */
@Injectable()
export class MikroOrmPayoutCommandRepository implements PayoutCommandRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async claim(
    input: ClaimPayoutInput,
    context: FinanceRepositoryContext,
  ): Promise<ClaimPayoutResult> {
    const entityManager = this.getEntityManager(context);
    const now = new Date();

    // A Payout left `pending` may still have an unresolved provider transfer, so
    // paying the shop again would send and discharge the same Orders twice. The
    // guard covers every platform month, not only the run's own month; the
    // partial unique indexes still keep one claim per source per month to a
    // single row. `on conflict do nothing` has no target because both indexes
    // are partial.
    const rows = await entityManager.execute<ClaimedPayoutRow[]>(
      `insert into payouts (
         id, created_at, updated_at, public_id, shop_id, payout_account_id,
         currency, amount_minor, state, provider_reference, attempt_count,
         run_day, paid_at, source, period_key, quota_consumed,
         requested_by_user_id, claimed_allocations, source_currency,
         target_currency, transfer_currency, transfer_amount_minor, fx_rate,
         target_amount_minor, fx_fee_minor
       )
       select ?, ?, ?, ?, ?, ?, ?, ?, 'pending', null, 0, ?, null, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?
       where not exists (
         select 1 from payouts where shop_id = ? and state = 'pending'
       )
       on conflict do nothing
       returning id, public_id, currency`,
      [
        randomUUID(),
        now,
        now,
        input.publicId,
        input.shopId,
        input.payoutAccountId,
        input.currency,
        input.amountMinor,
        input.runDay,
        input.source,
        input.periodKey,
        input.quotaConsumed,
        input.requestedByUserId ?? null,
        JSON.stringify(input.allocations),
        input.sourceCurrency,
        input.targetCurrency,
        input.transferCurrency,
        input.transferAmountMinor,
        input.fxRate,
        input.targetAmountMinor,
        input.fxFeeMinor,
        input.shopId,
      ],
    );

    const row = rows[0];

    if (row) {
      return { payout: { id: row.id, publicId: row.public_id, currency: row.currency } };
    }

    // The insert wrote nothing, so name why: the same precedence the callers
    // need — an unresolved transfer first, then the used allowance, then plain
    // lack of availability.
    const pending = await entityManager.execute<Array<{ exists: boolean }>>(
      `select exists (
         select 1 from payouts where shop_id = ? and state = 'pending'
       ) as "exists"`,
      [input.shopId],
    );

    if (pending[0]?.exists) {
      return { payout: null, rejection: 'pending' };
    }

    if (input.periodKey !== null) {
      const claimed = await entityManager.execute<Array<{ exists: boolean }>>(
        `select exists (
           select 1 from payouts
           where shop_id = ? and source = ? and period_key = ? and quota_consumed
         ) as "exists"`,
        [input.shopId, input.source, input.periodKey],
      );

      if (claimed[0]?.exists) {
        return { payout: null, rejection: 'period_claimed' };
      }
    }

    return { payout: null, rejection: 'not_claimable' };
  }

  async recordBlocked(
    input: BlockedPayoutInput,
    context: FinanceRepositoryContext,
  ): Promise<boolean> {
    const now = new Date();

    // A Blocked Payout is the month's decision for the shop: no usable account
    // existed to pay. It consumes the scheduled allowance, so the worker cannot
    // record the same block every tick, and a still-pending transfer keeps its
    // exclusive claim.
    const rows = await this.getEntityManager(context).execute<Array<{ id: string }>>(
      `insert into payouts (
         id, created_at, updated_at, public_id, shop_id, payout_account_id,
         currency, amount_minor, state, reason, provider_reference,
         attempt_count, run_day, paid_at, source, period_key, quota_consumed
       )
       select ?, ?, ?, ?, ?, null, ?, ?, 'blocked', ?, null, 0, ?, null, ?, ?, true
       where not exists (
         select 1 from payouts where shop_id = ? and state = 'pending'
       )
       on conflict do nothing
       returning id`,
      [
        randomUUID(),
        now,
        now,
        input.publicId,
        input.shopId,
        input.currency,
        input.amountMinor,
        input.reason,
        input.runDay,
        input.source,
        input.periodKey,
        input.shopId,
      ],
    );

    return rows.length > 0;
  }

  async settle(
    input: SettlePayoutInput,
    context: FinanceRepositoryContext,
  ): Promise<boolean> {
    const entityManager = this.getEntityManager(context);
    const now = new Date();

    const settled = await entityManager.execute<Array<{ id: string }>>(
      `update payouts
       set state = 'paid', provider_reference = ?, paid_at = ?, updated_at = ?,
           provider_fx_rate = ?, target_amount_minor = coalesce(?, target_amount_minor),
           attempt_count = attempt_count + 1
       where id = ? and state = 'pending'
       returning id`,
      [
        input.providerReference,
        input.paidAt,
        now,
        input.providerFxRate,
        input.targetAmountMinor,
        input.payoutId,
      ],
    );

    if (settled.length === 0) {
      return false;
    }

    for (const order of input.orders) {
      await entityManager.execute(
        // An Order's availability may be paid across several Payouts when a
        // negative balance was netted, so a line records only the amount this
        // Payout discharged and the Order keeps its remaining availability.
        `insert into payout_lines (
           id, created_at, updated_at, payout_id, order_id, amount_minor
         )
         values (?, ?, ?, ?, ?, ?)
         on conflict (payout_id, order_id) do nothing`,
        [randomUUID(), now, now, input.payoutId, order.orderId, order.amountMinor],
      );
    }

    return true;
  }

  async findPendingAttempt(
    payoutId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PendingPayoutAttempt | null> {
    const rows = await this.getEntityManager(context).execute<PendingPayoutRow[]>(
      `select id, public_id, shop_id, payout_account_id, currency, amount_minor,
              source, attempt_count, claimed_allocations, source_currency,
              target_currency, transfer_currency, transfer_amount_minor, fx_rate,
              target_amount_minor, fx_fee_minor, provider_fx_rate
       from payouts
       where id = ? and state = 'pending'`,
      [payoutId],
    );

    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      publicId: row.public_id,
      shopId: row.shop_id,
      payoutAccountId: row.payout_account_id,
      currency: row.currency,
      amountMinor: row.amount_minor,
      source: row.source,
      attemptCount: row.attempt_count,
      allocations: row.claimed_allocations ?? [],
      sourceCurrency: row.source_currency,
      targetCurrency: row.target_currency,
      transferCurrency: row.transfer_currency,
      transferAmountMinor: toNullableMinorUnits(row.transfer_amount_minor),
      fxRate: row.fx_rate,
      targetAmountMinor: toNullableMinorUnits(row.target_amount_minor),
      fxFeeMinor: toNullableMinorUnits(row.fx_fee_minor),
      providerFxRate: row.provider_fx_rate,
    };
  }

  async recordAttemptFailure(
    payoutId: string,
    context?: FinanceRepositoryContext,
  ): Promise<number | null> {
    const rows = await this.getEntityManager(context).execute<Array<{ attempt_count: number }>>(
      `update payouts
       set attempt_count = attempt_count + 1, updated_at = ?
       where id = ? and state = 'pending'
       returning attempt_count`,
      [new Date(), payoutId],
    );

    return rows[0]?.attempt_count ?? null;
  }

  async markFailed(
    input: FailPayoutInput,
    context?: FinanceRepositoryContext,
  ): Promise<boolean> {
    const rows = await this.getEntityManager(context).execute<Array<{ id: string }>>(
      `update payouts
       set state = 'failed', reason = ?, updated_at = ?
       where id = ? and state = 'pending'
       returning id`,
      [input.reason.slice(0, REASON_MAX_LENGTH), new Date(), input.payoutId],
    );

    return rows.length > 0;
  }

  async releaseQuota(
    payoutId: string,
    context: FinanceRepositoryContext,
  ): Promise<boolean> {
    const rows = await this.getEntityManager(context).execute<Array<{ id: string }>>(
      `update payouts
       set quota_consumed = false, updated_at = ?
       where id = ? and quota_consumed
       returning id`,
      [new Date(), payoutId],
    );

    return rows.length > 0;
  }

  private getEntityManager(context?: FinanceRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
