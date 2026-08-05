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

  abstract createRefund(paymentIntentId: string): Promise<RefundResult>;
}
