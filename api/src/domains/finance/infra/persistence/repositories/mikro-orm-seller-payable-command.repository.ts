import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { FinanceRepositoryContext } from '../../../app/ports/finance-repository-context';
import { SellerPayableCommandRepository } from '../../../app/ports/seller-payable-command.repository';

/**
 * Maintains the shop's one Seller Payable position. Every amount passed here is
 * already in the shop's Settlement Currency, and the position records that
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
      `update seller_payable_positions
       set available_minor = available_minor - ?, updated_at = ?
       where shop_id = ? and currency = ?`,
      [amountMinor, new Date(), shopId, currency],
    );
  }

  /**
   * Applies one delta to the shop's position, creating it when absent. The
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
      `insert into seller_payable_positions (
         id, shop_id, currency, available_minor, not_yet_available_minor,
         created_at, updated_at
       )
       values (?, ?, ?, ?, ?, ?, ?)
       on conflict (shop_id) do update
       set
         currency = excluded.currency,
         available_minor =
           seller_payable_positions.available_minor + excluded.available_minor,
         not_yet_available_minor =
           seller_payable_positions.not_yet_available_minor
           + excluded.not_yet_available_minor,
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
