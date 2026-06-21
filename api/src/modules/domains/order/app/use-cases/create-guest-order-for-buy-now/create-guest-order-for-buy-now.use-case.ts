import { Inject, Injectable } from '@nestjs/common';
import { CartRepository } from '~/modules/domains/cart/app/ports/cart.repository';
import { CartKind } from '~/modules/domains/cart/domain/enums/cart-kind.enum';
import {
  PAYMENT_CONFIG,
  type PaymentConfig,
} from '~/config/payment.config';
import {
  appJobDeduplicationKey,
  appJobName,
} from '~/common/jobs/job.types';
import { JobDispatcher } from '~/modules/shared/queue/app/ports/job-dispatcher';
import type { CreateGuestOrderForBuyNowDto } from '../../../api/rest/dto/create-guest-order-for-buy-now.dto';
import { doesCartMatchCheckoutQuote } from '../../checkout-quote-cart-matcher';
import { buildGuestOrderTrackingUrl } from '../../guest-order-tracking-url.builder';
import {
  CheckoutQuoteCartChangedError,
  TemporaryCartNotFoundError,
} from '../../errors/order-app.error';
import { GuestOrderTrackingTokenService } from '../../guest-order-tracking-token.service';
import { LoadCheckoutQuoteService } from '../../load-checkout-quote.service';
import { OrderCheckoutService } from '../../order-checkout.service';

@Injectable()
export class CreateGuestOrderForBuyNowUseCase {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly loadCheckoutQuoteService: LoadCheckoutQuoteService,
    private readonly orderCheckoutService: OrderCheckoutService,
    private readonly jobDispatcher: JobDispatcher,
    private readonly guestOrderTrackingTokenService: GuestOrderTrackingTokenService,
    @Inject(PAYMENT_CONFIG) private readonly paymentConfig: PaymentConfig,
  ) {}

  async execute(guestSessionId: string, body: CreateGuestOrderForBuyNowDto) {
    const quote = await this.loadCheckoutQuoteService.loadForGuest(guestSessionId, body.quoteId);
    const cart = await this.cartRepository.findCartByIdForActor(
      { type: 'guest', guestSessionId },
      quote.cartId,
    );

    if (!cart || cart.kind !== CartKind.BUY_NOW) {
      throw new TemporaryCartNotFoundError();
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
      isTempCart: true,
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
