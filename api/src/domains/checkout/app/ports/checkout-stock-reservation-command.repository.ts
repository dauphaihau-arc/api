import type { EntityManager } from '@mikro-orm/postgresql';

export interface StockItemQuantity {
  inventoryId: string;
  quantity: number;
}

/**
 * Balance of one Inventory Item after a pool-level mutation. The Stock Pool is
 * authoritative; `product_inventory` mirrors it in the database, so a caller
 * must never write these fields back to the aggregate itself.
 */
export interface StockBalanceAfterMutation {
  onHandQuantity: number;
  reservedQuantity: number;
}

export interface StockMutationCommand {
  /**
   * Stable command identity recorded on the immutable Inventory Movement so a
   * retried command cannot apply the same balance change twice.
   */
  commandId: string;
  cause: string;
}

export interface ReserveForQuoteInput {
  quoteId: string;
  cartId: string;
  expiresAt: Date;
  items: StockItemQuantity[];
}

export interface ConsumeReservationsForQuoteInput {
  quoteId: string;
  consumedAt: Date;
  items: StockItemQuantity[];
}

export interface QuoteReservationReleaseInput {
  quoteId: string;
  releasedAt: Date;
}

export interface ExpireQuoteReservationsInput extends QuoteReservationReleaseInput {
  expiresAtOrBefore: Date;
}

/**
 * Persistence of checkout Stock Reservations and their Inventory Movement
 * accounting. Every method takes the EntityManager of the transaction that
 * owns the balance change: these statements take row locks on
 * `product_inventory` and `product_stock_pool` in id order, so they must not
 * run on a forked manager outside the caller's transaction.
 *
 * One Inventory Item has exactly one default seller Stock Pool, and that pool
 * holds the reserved quantity for the whole requested amount.
 */
export abstract class CheckoutStockReservationCommandRepository {
  /**
   * Direct sale: decrements On-hand Quantity without a prior hold. An item
   * whose default seller pool cannot cover the quantity is absent from the
   * returned map rather than throwing, because the caller owns the
   * out-of-stock decision.
   */
  abstract applySaleForOrderItems(
    entityManager: EntityManager,
    items: StockItemQuantity[],
    command: StockMutationCommand,
  ): Promise<Map<string, StockBalanceAfterMutation>>;

  /**
   * Reverses a recorded sale by incrementing On-hand Quantity. Balances are
   * read back from the derived `product_inventory` aggregate, which is what
   * availability reads use.
   */
  abstract correctSaleForOrderItems(
    entityManager: EntityManager,
    items: StockItemQuantity[],
    command: StockMutationCommand,
  ): Promise<Map<string, StockBalanceAfterMutation>>;

  abstract reserveForQuote(
    entityManager: EntityManager,
    input: ReserveForQuoteInput,
  ): Promise<{ reservedCount: number }>;

  abstract consumeReservationsForQuote(
    entityManager: EntityManager,
    input: ConsumeReservationsForQuoteInput,
  ): Promise<{ consumedCount: number }>;

  abstract expireActiveReservationsForQuote(
    entityManager: EntityManager,
    input: ExpireQuoteReservationsInput,
  ): Promise<{ releasedCount: number }>;

  abstract releaseActiveReservationsForQuote(
    entityManager: EntityManager,
    input: QuoteReservationReleaseInput,
  ): Promise<{ releasedCount: number }>;
}
