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

  private getEntityManager(context?: CheckoutRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
