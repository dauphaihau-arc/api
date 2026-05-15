import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import Stripe from 'stripe';
import { MARKETPLACE_CURRENCIES } from '~/config/marketplace.config';
import type { PaymentConfig } from '~/config/payment.config';
import { PaymentGateway } from '../app/ports/payment-gateway';
import type {
  CreateStripeCheckoutSessionInput,
  StripeCheckoutLineItemInput,
} from '../app/ports/payment-gateway';

const ZERO_DECIMAL_CURRENCIES = ['JPY', 'KRW', 'VND'] as const;
const BASE_CURRENCY = 'USD';

@Injectable()
export class StripePaymentGateway extends PaymentGateway {
  private readonly stripe: Stripe | null;

  constructor(private readonly paymentConfig: PaymentConfig) {
    super();
    this.stripe = paymentConfig.stripeSecretKey
      ? new Stripe(paymentConfig.stripeSecretKey)
      : null;
  }

  async createStripeCheckoutSession(
    input: CreateStripeCheckoutSessionInput
  ): Promise<{ id: string; url: string; expiresAt?: Date }> {
    const stripe = this.requireStripe();
    const appBaseUrl = this.paymentConfig.appBaseUrl;

    if (!appBaseUrl) {
      throw new InternalServerErrorException(
        'APP_BASE_URL or CORS_ALLOWED_ORIGINS must be configured for Stripe checkout'
      );
    }

    const exchangeRate = await this.resolveExchangeRate(input.currency);
    const lineItems = input.lineItems.map((item) =>
      this.toCheckoutLineItem(item, input.currency, exchangeRate)
    );

    const params: Stripe.Checkout.SessionCreateParams = {
      submit_type: 'pay',
      mode: 'payment',
      customer_email: input.customerEmail,
      metadata: input.metadata,
      line_items: lineItems,
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: {
              amount: this.toStripeAmount(
                input.shippingAmount * exchangeRate,
                input.currency
              ),
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

    if ((input.discountAmount ?? 0) > 0) {
      const coupon = await stripe.coupons.create({
        name: 'DISCOUNT',
        duration: 'once',
        currency: input.currency,
        amount_off: this.toStripeAmount(
          (input.discountAmount ?? 0) * exchangeRate,
          input.currency
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

  constructStripeWebhookEvent(payload: Buffer, signature?: string): Stripe.Event {
    const stripe = this.requireStripe();
    const webhookSecret = this.paymentConfig.stripeWebhookSecretKey;

    if (!signature || !webhookSecret) {
      throw new BadRequestException('Stripe webhook signature is missing');
    }

    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }

  retrieveStripeCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    return this.requireStripe().checkout.sessions.retrieve(sessionId);
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new InternalServerErrorException('Stripe is not configured');
    }

    return this.stripe;
  }

  private async resolveExchangeRate(currency: string): Promise<number> {
    if (!MARKETPLACE_CURRENCIES.includes(currency as (typeof MARKETPLACE_CURRENCIES)[number])) {
      throw new BadRequestException('Unsupported currency');
    }

    if (currency === BASE_CURRENCY) {
      return 1;
    }

    const response = await fetch(`https://open.er-api.com/v6/latest/${BASE_CURRENCY}`);

    if (!response.ok) {
      throw new InternalServerErrorException('Failed to fetch exchange rates');
    }

    const data = await response.json() as { rates?: Record<string, number> };
    const exchangeRate = data.rates?.[currency];

    if (!exchangeRate) {
      throw new BadRequestException('Unsupported currency');
    }

    return exchangeRate;
  }

  private toCheckoutLineItem(
    item: StripeCheckoutLineItemInput,
    currency: string,
    exchangeRate: number
  ): Stripe.Checkout.SessionCreateParams.LineItem {
    return {
      price_data: {
        currency,
        product_data: {
          name: item.name,
          ...(item.imageUrl ? { images: [item.imageUrl] } : {}),
        },
        unit_amount: this.toStripeAmount(item.unitAmount * exchangeRate, currency),
      },
      quantity: item.quantity,
    };
  }

  private toStripeAmount(amount: number, currency: string): number {
    if (ZERO_DECIMAL_CURRENCIES.includes(currency as (typeof ZERO_DECIMAL_CURRENCIES)[number])) {
      return Math.round(amount);
    }

    return Math.round(amount * 100);
  }
}
