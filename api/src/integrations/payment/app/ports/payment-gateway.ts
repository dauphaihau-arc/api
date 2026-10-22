export interface CheckoutLineItemInput {
  name: string;
  imageUrl?: string;
  unitAmountMinor: number;
  quantity: number;
}

export interface ShippingAddressInput {
  fullName: string;
  address1: string;
  address2?: string;
  city: string;
  country: string;
  state: string;
  zip: string;
  phone?: string;
}

export interface CreateCheckoutSessionInput {
  customerEmail: string;
  currency: string;
  metadata?: Record<string, string>;
  lineItems: CheckoutLineItemInput[];
  shippingAmountMinor: number;
  discountAmountMinor?: number;
  shippingAddress?: ShippingAddressInput;
  successPath?: string;
  cancelPath?: string;
}

export interface CheckoutSessionResult {
  id: string;
  url: string;
  expiresAt?: Date;
}

export interface CheckoutSessionDetails {
  id: string;
  status?: string | null;
  paymentStatus?: string | null;
  paymentIntentId?: string;
  expiresAt?: Date;
}

export interface PaymentWebhookEvent<TObject = unknown> {
  id: string;
  type: string;
  data: {
    object: TObject;
  };
}

export interface RefundResult {
  id: string;
  status: string;
  amount: number;
  failureReason?: string | null;
}

/**
 * One provider refund as a webhook reports it. `paymentIntentId` is what lets
 * Finance find the Order before the create response has stored the refund id.
 */
export interface RefundDetails extends RefundResult {
  paymentIntentId?: string;
}

export interface CreateRefundOptions {
  /**
   * Provider idempotency key for the refund request, so a retried job that
   * never saw the first response cannot create a second refund.
   */
  idempotencyKey?: string;
}

export abstract class PaymentGateway {
  abstract createCheckoutSession(
    input: CreateCheckoutSessionInput
  ): Promise<CheckoutSessionResult>;

  abstract constructWebhookEvent(
    payload: Buffer,
    signature?: string
  ): PaymentWebhookEvent;

  abstract retrieveCheckoutSession(
    sessionId: string
  ): Promise<CheckoutSessionDetails>;

  /**
   * Refunds the remaining charge of the payment intent. An Order Refund always
   * returns the whole refundable amount, so the provider decides the sum and
   * reports it back on the result. The response is an acknowledgement, not a
   * final outcome: a refund can be created as `pending` and only later be
   * confirmed or refused, which arrives as a `refund.*` webhook.
   */
  abstract createRefund(
    paymentIntentId: string,
    options?: CreateRefundOptions,
  ): Promise<RefundResult>;

  /**
   * Reads one refund's current state, so a missed webhook does not leave a
   * refund pending forever.
   */
  abstract retrieveRefund(refundId: string): Promise<RefundResult>;
}
