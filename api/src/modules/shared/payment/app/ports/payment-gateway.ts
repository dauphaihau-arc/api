import type Stripe from 'stripe';

export interface StripeCheckoutLineItemInput {
  name: string;
  imageUrl?: string;
  unitAmount: number;
  quantity: number;
}

export interface StripeShippingAddressInput {
  fullName: string;
  address1: string;
  address2?: string;
  city: string;
  country: string;
  state: string;
  zip: string;
  phone?: string;
}

export interface CreateStripeCheckoutSessionInput {
  customerEmail: string;
  currency: string;
  metadata?: Record<string, string>;
  lineItems: StripeCheckoutLineItemInput[];
  shippingAmount: number;
  discountAmount?: number;
  shippingAddress?: StripeShippingAddressInput;
  successPath?: string;
  cancelPath?: string;
}

export abstract class PaymentGateway {
  abstract createStripeCheckoutSession(
    input: CreateStripeCheckoutSessionInput
  ): Promise<{ id: string; url: string; expiresAt?: Date }>;

  abstract constructStripeWebhookEvent(
    payload: Buffer,
    signature?: string
  ): Stripe.Event;

  abstract retrieveStripeCheckoutSession(
    sessionId: string
  ): Promise<Stripe.Checkout.Session>;
}
