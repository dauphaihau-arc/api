import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { OrderRefundStatus } from '../../../domain/enums/order-refund-status.enum';
import { OrderRefundEntity } from '../entities/order-refund.entity';
import {
  OrderRefundRepository,
  type CompleteOrderRefundInput,
  type CreateOrderRefundInput,
  type PaymentIntentOrderRef,
  type PendingRefundRef,
} from '../../../app/ports/order-refund.repository';
import type { OrderRepositoryContext } from '../../../app/ports/order-repository-context';

@Injectable()
export class MikroOrmOrderRefundRepository implements OrderRefundRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async createPending(
    input: CreateOrderRefundInput,
    context?: OrderRepositoryContext,
  ): Promise<OrderRefundEntity> {
    const entityManager = this.getEntityManager(context);

    const refund = entityManager.create(OrderRefundEntity, {
      order: input.orderId,
      currency: input.currency,
      amountMinor: input.amountMinor,
      status: OrderRefundStatus.PENDING,
      requestedAt: input.requestedAt,
    });

    entityManager.persist(refund);
    await entityManager.flush();

    return refund;
  }

  findPendingByOrderId(
    orderId: string,
    context?: OrderRepositoryContext,
  ): Promise<OrderRefundEntity | null> {
    return this.getEntityManager(context).getRepository(OrderRefundEntity).findOne({
      order: orderId,
      status: OrderRefundStatus.PENDING,
    }, {
      orderBy: { requestedAt: 'desc' },
    });
  }

  findLatestByOrderId(
    orderId: string,
    context?: OrderRepositoryContext,
  ): Promise<OrderRefundEntity | null> {
    return this.getEntityManager(context).getRepository(OrderRefundEntity).findOne({
      order: orderId,
    }, {
      orderBy: { requestedAt: 'desc' },
    });
  }

  findByProviderRefundId(
    providerRefundId: string,
    context?: OrderRepositoryContext,
  ): Promise<OrderRefundEntity | null> {
    return this.getEntityManager(context).getRepository(OrderRefundEntity).findOne({
      providerRefundId,
    }, {
      orderBy: { requestedAt: 'desc' },
    });
  }

  async findPendingByPaymentIntentId(
    paymentIntentId: string,
    context?: OrderRepositoryContext,
  ): Promise<OrderRefundEntity | null> {
    const entityManager = this.getEntityManager(context);

    // The provider event can arrive before the create response recorded its
    // refund id, so the Order is found by the intent it paid with.
    const rows = await entityManager.execute<Array<{ id: string }>>(
      `select r."id" as "id"
       from "order_refunds" r
       join "orders" o on o."id" = r."order_id"
       where r."status" = 'pending'
         and o."payment_details" ->> 'payment_intent_id' = ?
       order by r."requested_at" asc
       limit 1`,
      [paymentIntentId],
    );

    if (!rows[0]) {
      return null;
    }

    return entityManager.getRepository(OrderRefundEntity).findOne({ id: rows[0].id });
  }

  async findOrderByPaymentIntentId(
    paymentIntentId: string,
    context?: OrderRepositoryContext,
  ): Promise<PaymentIntentOrderRef | null> {
    // A multi-shop cart shares one payment intent; two rows mean the amount
    // cannot be attributed to an Order, so the caller must not guess.
    const rows = await this.getEntityManager(context).execute<
      Array<{ id: string; currency: string }>
    >(
      `select o."id" as "id", o."currency" as "currency"
       from "orders" o
       where o."payment_details" ->> 'payment_intent_id' = ?
       limit 2`,
      [paymentIntentId],
    );

    if (rows.length !== 1) {
      return null;
    }

    return { id: rows[0].id, currency: rows[0].currency };
  }

  async attachProviderRefund(
    refundId: string,
    providerRefundId: string,
    context?: OrderRepositoryContext,
  ): Promise<boolean> {
    const updated = await this.getEntityManager(context).execute<Array<{ id: string }>>(
      `update "order_refunds"
       set "provider_refund_id" = ?, "updated_at" = ?
       where "id" = ? and "status" = 'pending'
       returning "id"`,
      [providerRefundId, new Date(), refundId],
    );

    return updated.length > 0;
  }

  async findPendingBefore(
    requestedAtBefore: Date,
    limit: number,
    context?: OrderRepositoryContext,
  ): Promise<PendingRefundRef[]> {
    const rows = await this.getEntityManager(context).execute<
      Array<{ id: string; orderId: string; providerRefundId: string | null }>
    >(
      `select r."id" as "id", r."order_id" as "orderId",
              r."provider_refund_id" as "providerRefundId"
       from "order_refunds" r
       where r."status" = 'pending' and r."requested_at" < ?
       order by r."requested_at" asc
       limit ?`,
      [requestedAtBefore, limit],
    );

    return rows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      providerRefundId: row.providerRefundId ?? undefined,
    }));
  }

  async sumAmountMinorByStatus(
    orderId: string,
    statuses: readonly OrderRefundStatus[],
    context?: OrderRepositoryContext,
  ): Promise<number> {
    if (statuses.length === 0) {
      return 0;
    }

    const rows = await this.getEntityManager(context).execute<
      Array<{ total: number | string }>
    >(
      `select coalesce(sum("amount_minor"), 0)::int as "total"
       from "order_refunds"
       where "order_id" = ? and "status" in (${statuses.map(() => '?').join(', ')})`,
      [orderId, ...statuses],
    );

    return Number(rows[0]?.total ?? 0);
  }

  async markSucceeded(
    refundId: string,
    input: CompleteOrderRefundInput,
    context?: OrderRepositoryContext,
  ): Promise<boolean> {
    // Conditional on `pending`: only the transition out of it may publish the
    // Money Event, so a replayed provider event is a no-op.
    const updated = await this.getEntityManager(context).execute<Array<{ id: string }>>(
      `update "order_refunds"
       set "status" = 'succeeded',
           "refunded_amount_minor" = ?,
           "provider_refund_id" = coalesce(?, "provider_refund_id"),
           "completed_at" = ?,
           "failure_reason" = null,
           "updated_at" = now()
       where "id" = ? and "status" = 'pending'
       returning "id"`,
      [
        input.refundedAmountMinor,
        input.providerRefundId ?? null,
        input.completedAt,
        refundId,
      ],
    );

    return updated.length > 0;
  }

  async markFailed(
    refundId: string,
    input: {
      failureReason: string;
      completedAt: Date;
      providerRefundId?: string;
    },
    context?: OrderRepositoryContext,
  ): Promise<boolean> {
    const updated = await this.getEntityManager(context).execute<Array<{ id: string }>>(
      `update "order_refunds"
       set "status" = 'failed',
           "failure_reason" = ?,
           "provider_refund_id" = coalesce(?, "provider_refund_id"),
           "completed_at" = ?,
           "updated_at" = now()
       where "id" = ? and "status" = 'pending'
       returning "id"`,
      [
        input.failureReason,
        input.providerRefundId ?? null,
        input.completedAt,
        refundId,
      ],
    );

    return updated.length > 0;
  }

  private getEntityManager(context?: OrderRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
