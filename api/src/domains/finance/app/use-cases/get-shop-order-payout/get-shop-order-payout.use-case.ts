import { Injectable } from '@nestjs/common';
import { OrderNotFoundError } from '~/domains/order/app/errors/order-app.error';
import { JournalEntryRepository } from '../../ports/journal-entry.repository';
import {
  OrderPayoutQueryRepository,
  type OrderPayoutAttribution,
} from '../../ports/order-payout-query.repository';
import {
  OrderPayoutMethodService,
  type OrderPayoutMethod,
} from '../../services/order-payout-method.service';

/** When this Order's Seller Payable became available, or that it never did. */
export interface ShopOrderPayoutAvailability {
  recorded: boolean;
  /** The delivery the availability followed; null when no row is recorded. */
  availableAt: Date | null;
}

/** One Order's payout facts, as the seller and admin order timelines read them. */
export interface ShopOrderPayout {
  /** Order public id (ord_…). */
  orderId: string;
  currency: string;
  /**
   * The Seller Payable the Order still holds in the ledger, refunds already
   * netted. Null when the Order has no paid journal basis.
   */
  sellerPayableMinor: number | null;
  availability: ShopOrderPayoutAvailability;
  /** The newest Payout that claimed or paid this Order, or null when none did. */
  payout: OrderPayoutAttribution | null;
  /** Where this Order's money will go and when the next run would take it. */
  payoutMethod: OrderPayoutMethod;
}

export interface GetShopOrderPayoutInput {
  shopId: string;
  orderId: string;
}

/**
 * Reads one Order's payout facts for a shop that manages it. Finance owns the
 * facts: the Seller Payable comes from the Order's ledger basis and the
 * availability and Payout from what Finance recorded, never from the Order's
 * commercial status. An Order that does not exist, or belongs to another shop,
 * is indistinguishable from a missing one.
 */
@Injectable()
export class GetShopOrderPayoutUseCase {
  constructor(
    private readonly orderPayoutQueryRepository: OrderPayoutQueryRepository,
    private readonly journalEntryRepository: JournalEntryRepository,
    private readonly orderPayoutMethodService: OrderPayoutMethodService,
  ) {}

  async execute(input: GetShopOrderPayoutInput): Promise<ShopOrderPayout> {
    const facts = await this.orderPayoutQueryRepository.findOrderPayoutFacts(
      input.orderId,
    );

    if (!facts || facts.shopId !== input.shopId) {
      throw new OrderNotFoundError();
    }

    const [sellerPayable, payoutMethod] = await Promise.all([
      this.journalEntryRepository.findOrderSellerPayable(input.orderId),
      this.orderPayoutMethodService.resolve(input.shopId),
    ]);

    return {
      orderId: facts.orderPublicId,
      currency: facts.currency,
      sellerPayableMinor: sellerPayable ? sellerPayable.amountMinor : null,
      availability: {
        recorded: facts.availability !== null,
        availableAt: facts.availability?.availableAt ?? null,
      },
      payout: facts.payout,
      payoutMethod,
    };
  }
}
