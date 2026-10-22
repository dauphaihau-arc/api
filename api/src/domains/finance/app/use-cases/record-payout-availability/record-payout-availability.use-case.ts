import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { PayoutAvailability } from '../../../domain/value-objects/payout-availability';
import { PaidOrderPostingNotRecordedError } from '../../errors/finance-app.error';
import type { OrderDeliveredEvent } from '../../ports/order-delivered-event';
import { JournalEntryRepository } from '../../ports/journal-entry.repository';
import { OrderPaidEventRepository } from '../../ports/order-paid-event.repository';
import { PayoutAvailabilityRepository } from '../../ports/payout-availability.repository';
import { SellerPayableCommandRepository } from '../../ports/seller-payable-command.repository';

/**
 * Makes one delivered Order's Seller Payable available for payout. Resolves the
 * Order's Seller Payable from the ledger (never from the Order's commercial
 * status) net of any refund already recorded for it, records the availability
 * as its idempotency anchor, and moves that amount from the shop's
 * not-yet-available balance into its available balance in one transaction. A
 * replay of the same delivery records nothing further.
 *
 * A delivery can be processed before the Order's `order.paid` Journal Entry
 * exists. When the paid event is still queued or in flight that posting is
 * merely late, so the delivery fails to stay retryable rather than retiring and
 * losing the payout; a delivered Order with no paid event at all (a cash Order)
 * is a no-op.
 *
 * A delivery can also arrive after the Order was refunded (a shipment already
 * handed to a carrier survives cancellation). The refund then already debited
 * the Order's money from the shop, so the net payable is zero and nothing is
 * released. The per-Order lock makes that decision serial with the refund's
 * debit, so the two can never both act on the same money.
 */
@Injectable()
export class RecordPayoutAvailabilityUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly journalEntryRepository: JournalEntryRepository,
    private readonly payoutAvailabilityRepository: PayoutAvailabilityRepository,
    private readonly sellerPayableRepository: SellerPayableCommandRepository,
    private readonly orderPaidEventRepository: OrderPaidEventRepository,
  ) {}

  async execute(event: OrderDeliveredEvent): Promise<{ recorded: boolean }> {
    return this.entityManager.transactional(async (entityManager) => {
      await this.lockOrder(entityManager, event.orderId);

      const sellerPayable = await this.journalEntryRepository
        .findOrderSellerPayable(event.orderId, { entityManager });

      if (!sellerPayable) {
        const paidEventStatus = await this.orderPaidEventRepository
          .findStatusByOrderId(event.orderId);

        if (paidEventStatus === 'pending' || paidEventStatus === 'processing') {
          throw new PaidOrderPostingNotRecordedError(event.orderId);
        }

        return { recorded: false };
      }

      if (sellerPayable.amountMinor <= 0) {
        return { recorded: false };
      }

      const availability: PayoutAvailability = {
        orderId: event.orderId,
        shopId: sellerPayable.shopId,
        currency: sellerPayable.currency,
        amountMinor: sellerPayable.amountMinor,
        deliveredAt: new Date(event.deliveredAt),
        evidence: event.evidence.map((shipment) => ({
          shipmentId: shipment.shipmentId,
          shipmentPublicId: shipment.shipmentPublicId,
          deliveredAt: new Date(shipment.deliveredAt),
        })),
      };

      const recorded = await this.payoutAvailabilityRepository.record(
        availability,
        { entityManager },
      );

      if (!recorded) {
        return { recorded: false };
      }

      await this.sellerPayableRepository.releaseToAvailable(
        availability.shopId,
        availability.currency,
        availability.amountMinor,
        { entityManager },
      );

      await entityManager.flush();

      return { recorded: true };
    });
  }

  /**
   * Serializes the availability decision with a refund of the same Order, which
   * takes the same lock before choosing which balance bucket to debit.
   */
  private async lockOrder(
    entityManager: EntityManager,
    orderId: string,
  ): Promise<void> {
    await entityManager.execute(
      'select pg_advisory_xact_lock(hashtext(?))',
      [`finance.seller-payable.order:${orderId}`],
    );
  }
}
