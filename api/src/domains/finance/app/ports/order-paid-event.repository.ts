/**
 * The stored status of the `order.paid` outbox event that carries an Order's
 * paid money facts, or `null` when the Order has no such event. Finance owns
 * this copy of the statuses it reads so it never imports the outbox entity.
 */
export type OrderPaidEventStatus =
  | 'pending'
  | 'processing'
  | 'processed'
  | 'failed';

/**
 * Reads an Order's stored `order.paid` outbox status. Lets the delivered-Order
 * pipeline tell "this Order's paid posting is still on its way" apart from
 * "this Order never had a paid event", so a late paid posting is retried while
 * a genuinely unpaid Order is a no-op.
 */
export abstract class OrderPaidEventRepository {
  /**
   * Resolves the stored status of the Order's `order.paid` outbox event, or
   * `null` when the Order has none. Read-only.
   */
  abstract findStatusByOrderId(
    orderId: string,
  ): Promise<OrderPaidEventStatus | null>;
}
