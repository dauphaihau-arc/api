import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import Stripe from 'stripe';
import { MARKETPLACE_CURRENCIES } from '~/platform/config/marketplace.config';
import type { PaymentConfig } from '~/platform/config/payment.config';
import { PaymentGateway } from '../app/ports/payment-gateway';
import { toConnectAccountDetails } from './stripe-connect-account.mapper';
import type {
  ChargeBalanceTransactionReference,
  CheckoutLineItemInput,
  ConnectAccountChangedEvent,
  CheckoutSessionDetails,
  ConnectedPayoutEventDetails,
  CreateCheckoutSessionInput,
  CreateRefundOptions,
  DisputeBalanceTransactionsReference,
  PaymentWebhookEvent,
  ProviderBalanceTransaction,
  ProviderTransferEventDetails,
  RefundDetails,
} from '../app/ports/payment-gateway';

@Injectable()
export class StripePaymentGateway extends PaymentGateway {
  private readonly stripe: Stripe | null;

  constructor(private readonly paymentConfig: PaymentConfig) {
    super();
    this.stripe = paymentConfig.stripeSecretKey
      ? new Stripe(paymentConfig.stripeSecretKey)
      : null;
  }

  async createCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): Promise<{ id: string; url: string; expiresAt?: Date }> {
    const stripe = this.requireStripe();
    const appBaseUrl = this.paymentConfig.appBaseUrl;

    if (!appBaseUrl) {
      throw new InternalServerErrorException(
        'APP_BASE_URL or CORS_ALLOWED_ORIGINS must be configured for Stripe checkout',
      );
    }

    this.assertSupportedCurrency(input.currency);

    const params: Stripe.Checkout.SessionCreateParams = {
      submit_type: 'pay',
      mode: 'payment',
      customer_email: input.customerEmail,
      metadata: input.metadata,
      line_items: input.lineItems.map((item) =>
        this.toCheckoutLineItem(item, input.currency),
      ),
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: {
              amount: input.shippingAmountMinor,
              currency: input.currency,
            },
            display_name: 'Total shops',
          },
        },
      ],
      payment_method_types: ['card'],
      expires_at:
        Math.floor(Date.now() / 1000) +
        Math.floor(this.paymentConfig.checkoutSessionTtlMs / 1000),
      success_url: `${appBaseUrl}${input.successPath ?? '/success'}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appBaseUrl}${input.cancelPath ?? ''}`,
    };

    if (input.shippingAddress) {
      params.payment_intent_data = {
        shipping: {
          name: input.shippingAddress.fullName,
          phone: input.shippingAddress.phone,
          address: {
            country: input.shippingAddress.country,
            state: input.shippingAddress.state,
            city: input.shippingAddress.city,
            line1: input.shippingAddress.address1,
            line2: input.shippingAddress.address2 ?? '',
            postal_code: input.shippingAddress.zip,
          },
        },
      };
    }

    if ((input.discountAmountMinor ?? 0) > 0) {
      const coupon = await stripe.coupons.create({
        name: 'DISCOUNT',
        duration: 'once',
        currency: input.currency,
        amount_off: input.discountAmountMinor ?? 0,
        metadata: input.metadata,
      });
      params.discounts = [{ coupon: coupon.id }];
    }

    const session = await stripe.checkout.sessions.create(params);

    if (!session.url) {
      throw new InternalServerErrorException('Stripe checkout session URL missing');
    }

    return {
      id: session.id,
      url: session.url,
      expiresAt: session.expires_at
        ? new Date(session.expires_at * 1000)
        : undefined,
    };
  }

  constructWebhookEvent(payload: Buffer, signature?: string): PaymentWebhookEvent {
    const stripe = this.requireStripe();
    const webhookSecret = this.paymentConfig.stripeWebhookSecretKey;

    if (!signature || !webhookSecret) {
      throw new BadRequestException('Stripe webhook signature is missing');
    }

    return this.toWebhookEvent(
      stripe.webhooks.constructEvent(payload, signature, webhookSecret),
    );
  }

  async retrieveCheckoutSession(sessionId: string): Promise<CheckoutSessionDetails> {
    const session = await this.requireStripe().checkout.sessions.retrieve(sessionId);

    return this.toCheckoutSessionDetails(session);
  }

  async createRefund(paymentIntentId: string, options?: CreateRefundOptions) {
    // No amount: Stripe refunds the whole remaining charge, which is what a
    // full Order Refund returns. The idempotency key makes a retried job that
    // lost the first response safe.
    const refund = await this.requireStripe().refunds.create(
      {
        payment_intent: paymentIntentId,
      },
      options?.idempotencyKey
        ? { idempotencyKey: options.idempotencyKey }
        : undefined,
    );

    return {
      id: refund.id,
      status: refund.status ?? 'unknown',
      amount: refund.amount,
      failureReason: refund.failure_reason,
    };
  }

  async retrieveRefund(refundId: string) {
    const refund = await this.requireStripe().refunds.retrieve(refundId);

    return {
      id: refund.id,
      status: refund.status ?? 'unknown',
      amount: refund.amount,
      failureReason: refund.failure_reason,
    };
  }

  async retrieveBalanceTransaction(
    reference: string,
  ): Promise<ProviderBalanceTransaction> {
    const transaction = await this.requireStripe().balanceTransactions.retrieve(reference);

    return {
      id: transaction.id,
      amountMinor: transaction.amount,
      feeMinor: transaction.fee,
      netMinor: transaction.net,
      // Stripe reports currencies in lower case; the ledger stores ISO upper.
      currency: transaction.currency.toUpperCase(),
      createdAt: new Date(transaction.created * 1000),
      availableAt: transaction.available_on
        ? new Date(transaction.available_on * 1000)
        : undefined,
    };
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new InternalServerErrorException('Stripe is not configured');
    }

    return this.stripe;
  }

  private assertSupportedCurrency(currency: string): void {
    if (!MARKETPLACE_CURRENCIES.includes(currency as (typeof MARKETPLACE_CURRENCIES)[number])) {
      throw new BadRequestException('Unsupported currency');
    }
  }

  private toCheckoutLineItem(
    item: CheckoutLineItemInput,
    currency: string,
  ): Stripe.Checkout.SessionCreateParams.LineItem {
    return {
      price_data: {
        currency,
        product_data: {
          name: item.name,
          ...(item.imageUrl ? { images: [item.imageUrl] } : {}),
        },
        unit_amount: item.unitAmountMinor,
      },
      quantity: item.quantity,
    };
  }

  private toWebhookEvent(event: Stripe.Event): PaymentWebhookEvent {
    return {
      id: event.id,
      type: event.type,
      account: event.account ?? undefined,
      data: {
        object: this.toWebhookObject(event),
      },
    };
  }

  private toWebhookObject(event: Stripe.Event): unknown {
    switch (event.type) {
      case 'account.updated':
        return toConnectAccountDetails(event.data.object as Stripe.Account);
      case 'capability.updated':
        return toConnectAccountChangedEvent(
          event.data.object as Stripe.Capability,
          event.account,
        );
      case 'person.updated':
        return toConnectAccountChangedEvent(
          event.data.object as Stripe.Person,
          event.account,
        );
      case 'checkout.session.completed':
      case 'checkout.session.expired':
        return this.toCheckoutSessionDetails(
          event.data.object as Stripe.Checkout.Session,
        );
      case 'refund.created':
      case 'refund.updated':
      case 'refund.failed':
        return this.toRefundDetails(event.data.object as Stripe.Refund);
      case 'charge.succeeded':
      case 'charge.updated':
      case 'charge.refunded':
        return this.toChargeDetails(event.data.object as Stripe.Charge);
      case 'charge.dispute.created':
        return this.toDisputeDetails(event.data.object as Stripe.Dispute);
      case 'transfer.created':
      case 'transfer.updated':
      case 'transfer.reversed':
        return this.toTransferEventDetails(event);
      case 'payout.paid':
      case 'payout.failed':
        return this.toConnectedPayoutEventDetails(event);
      default:
        return event.data.object;
    }
  }

  /**
   * A `transfer.*` event carries the transfer the platform created for a
   * Payout. The object is reduced to the evidence Finance stores; the reversal
   * list is summed here so the amount is one number regardless of how many
   * partial reversals Stripe reported.
   */
  private toTransferEventDetails(event: Stripe.Event): ProviderTransferEventDetails {
    const transfer = event.data.object as Stripe.Transfer;
    const destination = transfer.destination;

    const destinationAccountId =
      (typeof destination === 'string' ? destination : destination?.id) ??
      event.account ??
      null;

    const reversals = transfer.reversals?.data ?? [];

    const reversedAmountMinor = reversals.reduce(
      (sum, reversal) => sum + reversal.amount,
      0,
    );

    return {
      transferId: transfer.id,
      amountMinor: transfer.amount,
      currency: transfer.currency.toUpperCase(),
      destinationAccountId,
      reversedAmountMinor,
      status: event.type === 'transfer.created'
        ? 'created'
        : event.type === 'transfer.reversed'
          ? 'reversed'
          : 'updated',
      occurredAt: new Date(event.created * 1000),
    };
  }

  /**
   * A connected-account `payout.*` event reports Stripe paying the seller's
   * bank. Its account is only on the event, and `arrival_date` is a timestamp:
   * it is reduced to the provider's day so the evidence matches the payout
   * calendar regardless of the webhook's time of day.
   */
  private toConnectedPayoutEventDetails(
    event: Stripe.Event,
  ): ConnectedPayoutEventDetails {
    const payout = event.data.object as Stripe.Payout;
    // `arrival_date` is a unix timestamp; the provider's UTC calendar day is
    // what the payout calendar records.
    const arrivalDate = new Date(payout.arrival_date * 1000)
      .toISOString()
      .slice(0, 10);

    return {
      payoutId: payout.id,
      accountId: event.account ?? null,
      status: event.type === 'payout.paid' ? 'paid' : 'failed',
      amountMinor: payout.amount,
      currency: payout.currency.toUpperCase(),
      arrivalDate,
      failureCode: payout.failure_code ?? null,
      occurredAt: new Date(event.created * 1000),
    };
  }

  private toRefundDetails(refund: Stripe.Refund): RefundDetails {
    return {
      id: refund.id,
      paymentIntentId: typeof refund.payment_intent === 'string'
        ? refund.payment_intent
        : refund.payment_intent?.id,
      status: refund.status ?? 'unknown',
      amount: refund.amount,
      failureReason: refund.failure_reason,
      balanceTransactionId: this.toBalanceTransactionId(refund.balance_transaction),
    };
  }

  private toChargeDetails(charge: Stripe.Charge): ChargeBalanceTransactionReference {
    return {
      chargeId: charge.id,
      balanceTransactionId: this.toBalanceTransactionId(charge.balance_transaction),
    };
  }

  private toDisputeDetails(
    dispute: Stripe.Dispute,
  ): DisputeBalanceTransactionsReference {
    // Stripe expands `balance_transactions`, but the id may arrive unexpanded,
    // so both shapes are accepted.
    const transactions =
      (dispute.balance_transactions ?? []) as Array<string | Stripe.BalanceTransaction>;

    return {
      disputeId: dispute.id,
      balanceTransactionIds: transactions
        .map((transaction) =>
          typeof transaction === 'string' ? transaction : transaction.id)
        .filter((id): id is string => Boolean(id)),
    };
  }

  private toBalanceTransactionId(
    reference: string | Stripe.BalanceTransaction | null | undefined,
  ): string | null {
    if (!reference) {
      return null;
    }

    return typeof reference === 'string' ? reference : reference.id;
  }

  private toCheckoutSessionDetails(
    session: Stripe.Checkout.Session,
  ): CheckoutSessionDetails {
    return {
      id: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      paymentIntentId: session.payment_intent?.toString(),
      expiresAt: session.expires_at
        ? new Date(session.expires_at * 1000)
        : undefined,
    };
  }
}

/**
 * A `capability.updated` or `person.updated` event names the connected account
 * on the event, and again on the capability/person object as an id or an
 * expanded object. Any of them identifies the account whose current state the
 * handler must re-read.
 */
function toConnectAccountChangedEvent(
  object: { account?: string | { id: string } | null },
  eventAccount: string | undefined,
): ConnectAccountChangedEvent {
  if (eventAccount) {
    return { accountId: eventAccount };
  }

  const account = object.account;

  if (typeof account === 'string') {
    return { accountId: account };
  }

  if (account && typeof account === 'object') {
    return { accountId: account.id };
  }

  return { accountId: null };
}
