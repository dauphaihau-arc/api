import type { OrderRefundStatus } from '../../domain/enums/order-refund-status.enum';
import type { OrderRefundEntity } from '../../infra/persistence/entities/order-refund.entity';
import type { OrderRepositoryContext } from './order-repository-context';

export interface CreateOrderRefundInput {
  orderId: string;
  /** The currency the buyer paid in. */
  currency: string;
  amountMinor: number;
  requestedAt: Date;
}

export interface CompleteOrderRefundInput {
  providerRefundId?: string;
  refundedAmountMinor: number;
  completedAt: Date;
}

/** One pending refund the reconciliation sweep must revisit. */
export interface PendingRefundRef {
  id: string;
  orderId: string;
  providerRefundId?: string;
}

/** The Order a refund the app never requested belongs to, with its charge currency. */
export interface PaymentIntentOrderRef {
  id: string;
  currency: string;
}

/**
 * The recorded Order Refund facts. Writes join the caller's transaction so a
 * refund request and the Order projection it belongs to commit together, and a
 * completed refund and its Money Event outbox row never disagree.
 */
export abstract class OrderRefundRepository {
  abstract createPending(
    input: CreateOrderRefundInput,
    context?: OrderRepositoryContext,
  ): Promise<OrderRefundEntity>;

  abstract findPendingByOrderId(
    orderId: string,
    context?: OrderRepositoryContext,
  ): Promise<OrderRefundEntity | null>;

  abstract findLatestByOrderId(
    orderId: string,
    context?: OrderRepositoryContext,
  ): Promise<OrderRefundEntity | null>;

  abstract findByProviderRefundId(
    providerRefundId: string,
    context?: OrderRepositoryContext,
  ): Promise<OrderRefundEntity | null>;

  /**
   * Resolves the Order's in-flight refund from the payment intent, for a
   * provider event that arrives before the create response recorded its refund
   * id. `null` when no Order carries that intent or nothing is pending.
   */
  abstract findPendingByPaymentIntentId(
    paymentIntentId: string,
    context?: OrderRepositoryContext,
  ): Promise<OrderRefundEntity | null>;

  /**
   * Resolves the single Order charged with this payment intent, for a refund
   * issued outside the app that has no local fact yet. `null` when no Order
   * carries the intent, or when several do: a multi-shop cart shares one
   * intent and splitting the amount is not defined, so it is never a guess.
   */
  abstract findOrderByPaymentIntentId(
    paymentIntentId: string,
    context?: OrderRepositoryContext,
  ): Promise<PaymentIntentOrderRef | null>;

  /**
   * Stores the provider's refund id on a still-pending fact. Returns `false`
   * when the fact already reached an outcome, so a late acknowledgement cannot
   * reopen it.
   */
  abstract attachProviderRefund(
    refundId: string,
    providerRefundId: string,
    context?: OrderRepositoryContext,
  ): Promise<boolean>;

  /**
   * The sum of this Order's refunds in one of the given outcomes, in the charge
   * currency. Succeeded refunds are what has left the seller's account; pending
   * ones are money already committed to a buyer.
   */
  abstract sumAmountMinorByStatus(
    orderId: string,
    statuses: readonly OrderRefundStatus[],
    context?: OrderRepositoryContext,
  ): Promise<number>;

  /**
   * The pending refunds older than `requestedAtBefore`, oldest first. The
   * reconciliation sweep uses them to recover a refund whose provider event
   * never arrived: one with a provider id is re-read, one without is retried.
   */
  abstract findPendingBefore(
    requestedAtBefore: Date,
    limit: number,
    context?: OrderRepositoryContext,
  ): Promise<PendingRefundRef[]>;

  /**
   * Records the outcome of a pending refund. Returns `true` only for the call
   * that moved it out of `pending`, so a replayed provider event neither
   * republishes the Money Event nor moves a balance twice.
   */
  abstract markSucceeded(
    refundId: string,
    input: CompleteOrderRefundInput,
    context?: OrderRepositoryContext,
  ): Promise<boolean>;

  abstract markFailed(
    refundId: string,
    input: {
      failureReason: string;
      completedAt: Date;
      /** The provider's own refund id, when the refusal still produced one. */
      providerRefundId?: string;
    },
    context?: OrderRepositoryContext,
  ): Promise<boolean>;
}
