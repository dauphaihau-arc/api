import type { FinanceRepositoryContext } from './finance-repository-context';

/**
 * The recorded fact that one Order's Seller Payable became available for payout,
 * read from its `payout_availabilities` row. `availableAt` is the delivery the
 * availability followed; availability is never derived from the Order's own
 * commercial status.
 */
export interface OrderPayoutAvailability {
  /** Always `true`: this shape only exists when the row was recorded. */
  recorded: true;

  availableAt: Date;

  /** The Seller Payable the Order made available, in the shop's Settlement Currency. */
  amountMinor: number;
}

/** The most recent Payout attributable to one Order, and only that Order's share of it. */
export interface OrderPayoutAttribution {
  /** Payout public id (`pay_…`). */
  id: string;

  /**
   * `paid` once the Payout settled, `pending` while its provider transfer may
   * still move the money.
   */
  state: 'pending' | 'paid';

  /** This Order's share of the Payout, in the shop's Settlement Currency. */
  amountMinor: number;

  /** When the Payout settled; null while it is still `pending`. */
  paidAt: Date | null;
}

/**
 * One Order's payout facts as Finance owns them: the availability it recorded,
 * the Payout that claimed or paid it, and the Order header the caller echoes
 * back. The Order is referenced by identity, so the header is read here rather
 * than handed in as a foreign ORM entity.
 */
export interface OrderPayoutFacts {
  /** Order public id (`ord_…`). */
  orderPublicId: string;

  shopId: string;

  /** The Order's currency, in which its money was charged. */
  currency: string;

  availability: OrderPayoutAvailability | null;
  payout: OrderPayoutAttribution | null;
}

/**
 * Reads the payout facts attributable to one Order. Nothing here writes, and
 * nothing is derived from the Order's commercial status: availability comes
 * from its recorded row and a Payout only from what it actually claimed or
 * paid.
 */
export abstract class OrderPayoutQueryRepository {
  /**
   * The Order's payout facts, or `null` when no Order has that id. A missing
   * availability row and a never-claimed Order both read as `null` fields, so
   * "not recorded" and "not paid" stay distinguishable from a missing Order.
   */
  abstract findOrderPayoutFacts(
    orderId: string,
    context?: FinanceRepositoryContext,
  ): Promise<OrderPayoutFacts | null>;
}
