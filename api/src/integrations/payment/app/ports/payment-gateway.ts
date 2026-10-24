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
  /** The provider's record of this refund movement, which carries its fee. */
  balanceTransactionId: string | null;
}

/**
 * One provider balance transaction: the provider's own record of a single
 * movement of money and the fee it charged for it.
 *
 * Values are in minor units. `feeMinor` is signed by the provider: positive is
 * a fee it charged, negative reverses a previously charged fee (a refund).
 */
export interface ProviderBalanceTransaction {
  id: string;
  amountMinor: number;
  feeMinor: number;
  netMinor: number;
  currency: string;
  createdAt: Date;
  availableAt?: Date;
}

/**
 * A `charge.*` webhook reports its balance transaction, which is what carries
 * the fee. Expanded objects are reduced to the id.
 */
export interface ChargeBalanceTransactionReference {
  chargeId: string;
  balanceTransactionId: string | null;
}

/**
 * A dispute moves money in one or more balance transactions, each of which
 * carries the fee the provider charged for it.
 */
export interface DisputeBalanceTransactionsReference {
  disputeId: string;
  balanceTransactionIds: string[];
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

  /**
   * Reads one balance transaction, the provider's record of a movement and the
   * fee it charged for it. The webhook only carries the reference; its body can
   * arrive before the transaction is readable, in which case this rejects and
   * the caller retries.
   */
  abstract retrieveBalanceTransaction(
    reference: string,
  ): Promise<ProviderBalanceTransaction>;
}
