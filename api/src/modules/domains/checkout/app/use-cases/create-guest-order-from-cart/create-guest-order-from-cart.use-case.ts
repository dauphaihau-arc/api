import { Inject, Injectable } from '@nestjs/common';
import {
  PAYMENT_CONFIG,
  type PaymentConfig,
} from '~/config/payment.config';
import {
  appJobDeduplicationKey,
  appJobName,
} from '~/common/jobs/job.types';
import type { CreateGuestOrderFromCartDto } from '../../../api/rest/dto/create-guest-order-from-cart.dto';
import { CartRepository } from '~/modules/domains/cart/app/ports/cart.repository';
import { JobDispatcher } from '~/modules/shared/queue/app/ports/job-dispatcher';
import { doesCartMatchCheckoutQuote } from '../../checkout-quote-cart-matcher';
import { buildGuestOrderTrackingUrl } from '../../guest-order-tracking-url.builder';
import { GuestOrderTrackingTokenService } from '../../guest-order-tracking-token.service';
import {
  CartNotFoundError,
  CheckoutQuoteCartChangedError,
} from '../../../../order/app/errors/order-app.error';
import { LoadCheckoutQuoteService } from '../../load-checkout-quote.service';
import { OrderCheckoutService } from '../../../../order/app/order-checkout.service';

@Injectable()
export class CreateGuestOrderFromCartUseCase {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly loadCheckoutQuoteService: LoadCheckoutQuoteService,
    private readonly orderCheckoutService: OrderCheckoutService,
    private readonly jobDispatcher: JobDispatcher,
    private readonly guestOrderTrackingTokenService: GuestOrderTrackingTokenService,
    @Inject(PAYMENT_CONFIG) private readonly paymentConfig: PaymentConfig,
  ) {}

  async execute(guestSessionId: string, body: CreateGuestOrderFromCartDto) {
    const quote = await this.loadCheckoutQuoteService.loadForGuest(guestSessionId, body.quoteId);
    const cart = await this.cartRepository.findCartByIdForActor({
      type: 'guest',
      guestSessionId,
    }, quote.cartId);

    if (!cart) {
      throw new CartNotFoundError();
    }

    if (!doesCartMatchCheckoutQuote(cart, quote)) {
      throw new CheckoutQuoteCartChangedError();
    }

    const result = await this.orderCheckoutService.createOrders({
      type: 'guest',
      email: body.guest.email,
    }, cart.id, cart, {
      paymentType: body.paymentType,
      shippingAddress: quote.shippingAddress,
      shopAdjustments: quote.shopAdjustments,
      quote,
      isTempCart: false,
    });

    const trackingToken = this.guestOrderTrackingTokenService.issue(
      result.checkoutSessionId
        ? { sessionId: result.checkoutSessionId }
        : {
          email: body.guest.email,
          orderIds: result.orderShops.map((orderShop) => orderShop.id),
        },
    );
    const trackingUrl = buildGuestOrderTrackingUrl(
      this.paymentConfig,
      trackingToken,
    );

    if (trackingUrl) {
      await this.jobDispatcher.dispatch(
        appJobName.sendGuestOrderConfirmationEmail,
        {
          email: body.guest.email,
          orderIds: result.orderShops.map((orderShop) => orderShop.id),
          trackingUrl,
          shopNames: result.orderShops.map((orderShop) => orderShop.shopName),
        },
        {
          deduplicationKey: appJobDeduplicationKey.sendGuestOrderConfirmationEmail(
            body.guest.email,
            result.orderShops.map((orderShop) => orderShop.id),
          ),
        },
      );
    }

    return result;
  }
}
