import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { FinanceRepositoryContext } from '../../../app/ports/finance-repository-context';
import { SellerPayableCommandRepository } from '../../../app/ports/seller-payable-command.repository';

/**
 * Maintains the shop's one Seller Payable balance. Every amount passed here is
 * already in the shop's Settlement Currency, and the row records that
 * currency, so a later currency change updates the row rather than splitting it.
 */
@Injectable()
export class MikroOrmSellerPayableCommandRepository implements SellerPayableCommandRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async creditNotYetAvailable(
    shopId: string,
    currency: string,
    amountMinor: number,
    context: FinanceRepositoryContext,
  ): Promise<void> {
    await this.applyDelta(shopId, currency, 0, amountMinor, context);
  }

  async releaseToAvailable(
    shopId: string,
    currency: string,
    amountMinor: number,
    context: FinanceRepositoryContext,
  ): Promise<void> {
    await this.applyDelta(shopId, currency, amountMinor, -amountMinor, context);
  }

  /**
   * Removes the paid amount from the shop's available Seller Payable. The row
   * already exists: only recorded availability ever reaches this path.
   */
  async dischargeAvailable(
    shopId: string,
    currency: string,
    amountMinor: number,
    context: FinanceRepositoryContext,
  ): Promise<void> {
    await this.getEntityManager(context).execute(
      `update seller_payable_balances
       set available_balance_minor = available_balance_minor - ?, updated_at = ?
       where shop_id = ? and currency = ?`,
      [amountMinor, new Date(), shopId, currency],
    );
  }

  /**
   * Reduces the balance bucket that holds the refunded Order's money, in one
   * statement so the bucket choice and the debit are atomic under concurrent
   * refunds. A recorded Payout Availability means the Order's money moved into
   * the available part, so the refund reduces available; otherwise it reduces
   * the not-yet-available part. The part may go negative rather than being
   * clamped, so a refund debt is carried and netted by a later Payout.
   */
  async debitForRefund(
    orderId: string,
    shopId: string,
    currency: string,
    amountMinor: number,
    context: FinanceRepositoryContext,
  ): Promise<void> {
    const entityManager = this.getEntityManager(context);
    const now = new Date();

    // Serialize with this Order's delivery, which takes the same lock before
    // deciding whether it has anything left to make available. Whichever of the
    // two runs second sees the other's committed state, so a refund is never
    // debited from one bucket while availability lands in the other.
    await entityManager.execute(
      'select pg_advisory_xact_lock(hashtext(?))',
      [`finance.seller-payable.order:${orderId}`],
    );

    await entityManager.execute(
      `insert into seller_payable_balances (
         id, shop_id, currency, available_balance_minor, pending_balance_minor,
         created_at, updated_at
       )
       select
         ?,
         ?,
         ?,
         case when exists (
           select 1 from payout_availabilities where order_id = ?
         ) then -(?::bigint) else 0 end,
         case when exists (
           select 1 from payout_availabilities where order_id = ?
         ) then 0 else -(?::bigint) end,
         ?,
         ?
       on conflict (shop_id) do update
       set
         currency = excluded.currency,
         available_balance_minor =
           seller_payable_balances.available_balance_minor + excluded.available_balance_minor,
         pending_balance_minor =
           seller_payable_balances.pending_balance_minor
           + excluded.pending_balance_minor,
         updated_at = now()`,
      [
        randomUUID(),
        shopId,
        currency,
        orderId,
        amountMinor,
        orderId,
        amountMinor,
        now,
        now,
      ],
    );
  }

  /**
   * Applies one delta to the shop's balance, creating it when absent. The
   * upsert is race-safe: concurrent deltas for one shop must all land rather
   * than one overwriting the other.
   */
  private async applyDelta(
    shopId: string,
    currency: string,
    availableDeltaMinor: number,
    notYetAvailableDeltaMinor: number,
    context: FinanceRepositoryContext,
  ): Promise<void> {
    const now = new Date();

    await this.getEntityManager(context).execute(
      `insert into seller_payable_balances (
         id, shop_id, currency, available_balance_minor, pending_balance_minor,
         created_at, updated_at
       )
       values (?, ?, ?, ?, ?, ?, ?)
       on conflict (shop_id) do update
       set
         currency = excluded.currency,
         available_balance_minor =
           seller_payable_balances.available_balance_minor + excluded.available_balance_minor,
         pending_balance_minor =
           seller_payable_balances.pending_balance_minor
           + excluded.pending_balance_minor,
         updated_at = now()`,
      [
        randomUUID(),
        shopId,
        currency,
        availableDeltaMinor,
        notYetAvailableDeltaMinor,
        now,
        now,
      ],
    );
  }

  private getEntityManager(context?: FinanceRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
