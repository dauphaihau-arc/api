import type { EntityManager } from '@mikro-orm/postgresql';
import type { CheckoutQuoteEntity } from '../../infra/persistence/entities/checkout-quote.entity';

export interface CheckoutRepositoryContext {
  entityManager?: EntityManager;
}

export interface FindReusableCheckoutQuoteInput {
  actor:
    | { type: 'user'; userId: string }
    | { type: 'guest'; guestSessionId: string };
  cartId: string;
  quoteFingerprint: string;
  reservationCount: number;
  now: Date;
}

export abstract class CheckoutQuoteRepository {
  abstract findById(
    quoteId: string,
    context?: CheckoutRepositoryContext
  ): Promise<CheckoutQuoteEntity | null>;

  abstract findForUser(
    input: { userId: string; quoteId: string },
    context?: CheckoutRepositoryContext
  ): Promise<CheckoutQuoteEntity | null>;

  abstract findForGuest(
    input: { guestSessionId: string; quoteId: string },
    context?: CheckoutRepositoryContext
  ): Promise<CheckoutQuoteEntity | null>;

  abstract findReusable(
    input: FindReusableCheckoutQuoteInput,
    context?: CheckoutRepositoryContext
  ): Promise<CheckoutQuoteEntity | null>;
}
