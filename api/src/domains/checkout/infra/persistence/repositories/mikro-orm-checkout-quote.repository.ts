import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  CheckoutQuoteActorType,
  CheckoutQuoteEntity,
} from '../entities/checkout-quote.entity';
import {
  CheckoutStockReservationEntity,
  CheckoutStockReservationStatus,
} from '../entities/checkout-stock-reservation.entity';
import {
  CheckoutQuoteRepository,
  type CheckoutRepositoryContext,
  type FindReusableCheckoutQuoteInput,
  type InvalidateQuotesForProductLifecycleInput,
} from '../../../app/ports/checkout-quote.repository';

@Injectable()
export class MikroOrmCheckoutQuoteRepository implements CheckoutQuoteRepository {
  constructor(private readonly entityManager: EntityManager) {}

  findById(
    quoteId: string,
    context?: CheckoutRepositoryContext,
  ): Promise<CheckoutQuoteEntity | null> {
    return this.getEntityManager(context)
      .getRepository(CheckoutQuoteEntity)
      .findOne({ id: quoteId });
  }

  findForUser(
    input: { userId: string; quoteId: string },
    context?: CheckoutRepositoryContext,
  ): Promise<CheckoutQuoteEntity | null> {
    return this.getEntityManager(context)
      .getRepository(CheckoutQuoteEntity)
      .findOne({
        id: input.quoteId,
        actorType: CheckoutQuoteActorType.USER,
        user: input.userId,
      });
  }

  findForGuest(
    input: { guestSessionId: string; quoteId: string },
    context?: CheckoutRepositoryContext,
  ): Promise<CheckoutQuoteEntity | null> {
    return this.getEntityManager(context)
      .getRepository(CheckoutQuoteEntity)
      .findOne({
        id: input.quoteId,
        actorType: CheckoutQuoteActorType.GUEST,
        guestSessionId: input.guestSessionId,
      });
  }

  async findReusable(
    input: FindReusableCheckoutQuoteInput,
    context?: CheckoutRepositoryContext,
  ): Promise<CheckoutQuoteEntity | null> {
    const entityManager = this.getEntityManager(context);

    const quote = await entityManager.getRepository(CheckoutQuoteEntity).findOne(
      {
        cartId: input.cartId,
        quoteFingerprint: input.quoteFingerprint,
        expiresAt: { $gt: input.now },
        invalidatedAt: null,
        ...(input.actor.type === 'user'
          ? {
            actorType: CheckoutQuoteActorType.USER,
            user: input.actor.userId,
          }
          : {
            actorType: CheckoutQuoteActorType.GUEST,
            guestSessionId: input.actor.guestSessionId,
          }),
      },
      { orderBy: { createdAt: 'desc' as const } },
    );

    if (!quote) {
      return null;
    }

    const activeReservations = await entityManager
      .getRepository(CheckoutStockReservationEntity)
      .count({
        quote: quote.id,
        status: CheckoutStockReservationStatus.ACTIVE,
        expiresAt: { $gt: input.now },
      });

    return activeReservations === input.reservationCount ? quote : null;
  }

  async invalidateUnpaidForProductLifecycle(
    input: InvalidateQuotesForProductLifecycleInput,
    context?: CheckoutRepositoryContext,
  ): Promise<string[]> {
    const entityManager = this.getEntityManager(context);
    const params: Array<string | Date> = [
      input.invalidatedAt,
      input.reason,
      input.productId,
    ];
    const variantFilter = input.productVariantId
      ? 'and product_inventory.product_variant_id = ?::uuid'
      : '';

    if (input.productVariantId) {
      params.push(input.productVariantId);
    }

    const rows = await entityManager.execute<Array<{ id: string }>>(
      `
        with affected_quotes as (
          select distinct checkout_quotes.id
          from checkout_quotes
          join checkout_quote_items
            on checkout_quote_items.quote_id = checkout_quotes.id
          join product_inventory
            on product_inventory.id = checkout_quote_items.inventory_id
          where checkout_quotes.invalidated_at is null
            and checkout_quotes.expires_at > ?
            and product_inventory.product_id = ?::uuid
            ${variantFilter}
            and not exists (
              select 1
              from orders
              where orders.payment_details ->> 'quote_id' = checkout_quotes.id::text
            )
        )
        update checkout_quotes
        set invalidated_at = ?,
            invalidated_reason = ?,
            updated_at = now()
        from affected_quotes
        where checkout_quotes.id = affected_quotes.id
        returning checkout_quotes.id
      `,
      [
        input.invalidatedAt,
        input.productId,
        ...(input.productVariantId ? [input.productVariantId] : []),
        ...params.slice(0, 2),
      ],
    );

    return rows.map((row) => row.id);
  }

  private getEntityManager(context?: CheckoutRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
