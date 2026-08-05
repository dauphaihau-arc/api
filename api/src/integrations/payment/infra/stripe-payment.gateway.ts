import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import Stripe from 'stripe';
import { MARKETPLACE_CURRENCIES } from '~/platform/config/marketplace.config';
import type { PaymentConfig } from '~/platform/config/payment.config';
import { PaymentGateway } from '../app/ports/payment-gateway';
import type {
  CheckoutLineItemInput,
  CheckoutSessionDetails,
  CreateCheckoutSessionInput,
  PaymentWebhookEvent,
} from '../app/ports/payment-gateway';

const ZERO_DECIMAL_CURRENCIES = ['JPY', 'KRW', 'VND'] as const;

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
              amount: this.toStripeAmount(input.shippingAmountMinor, input.currency),
              currency: input.currency,
            },
            display_name: 'Total shops',
          },
        },
      ],
      payment_method_types: ['card'],
      expires_at: Math.floor(Date.now() / 1000) + (1800 * 2),
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
        amount_off: this.toStripeAmount(
          input.discountAmountMinor ?? 0,
          input.currency,
        ),
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

  async createRefund(paymentIntentId: string) {
    const refund = await this.requireStripe().refunds.create({
      payment_intent: paymentIntentId,
    });

    return {
      id: refund.id,
      status: refund.status ?? 'unknown',
      amount: refund.amount,
      failureReason: refund.failure_reason,
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
        unit_amount: this.toStripeAmount(item.unitAmountMinor, currency),
      },
      quantity: item.quantity,
    };
  }

  private toStripeAmount(amountMinor: number, currency: string): number {
    if (ZERO_DECIMAL_CURRENCIES.includes(currency as (typeof ZERO_DECIMAL_CURRENCIES)[number])) {
      return Math.round(amountMinor);
    }

    return Math.round(amountMinor);
  }

  private toWebhookEvent(event: Stripe.Event): PaymentWebhookEvent {
    return {
      id: event.id,
      type: event.type,
      data: {
        object: this.toWebhookObject(event),
      },
    };
  }

  private toWebhookObject(event: Stripe.Event): unknown {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.expired':
        return this.toCheckoutSessionDetails(
          event.data.object as Stripe.Checkout.Session,
        );
      default:
        return event.data.object;
    }
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
