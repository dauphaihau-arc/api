import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { CartRepository } from '~/domains/cart/app/ports/cart.repository';
import { CartKind } from '~/domains/cart/domain/enums/cart-kind.enum';
import { doesCartMatchCheckoutQuote } from '../../checkout-quote-cart-matcher';
import type { CreateOrderForBuyNowDto } from '../../../api/rest/dto/create-order-for-buy-now.dto';
import {
  CheckoutQuoteCartChangedError,
  TemporaryCartNotFoundError,
} from '../../../../order/app/errors/order-app.error';
import { LoadCheckoutQuoteService } from '../../services/load-checkout-quote.service';
import { OrderCheckoutService } from '../../../../order/app/services/order-checkout.service';

@Injectable()
export class CreateOrderForBuyNowUseCase {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly loadCheckoutQuoteService: LoadCheckoutQuoteService,
    private readonly orderCheckoutService: OrderCheckoutService,
  ) {}

  async execute(actor: AuthenticatedUser, body: CreateOrderForBuyNowDto) {
    const quote = await this.loadCheckoutQuoteService.loadForUser(actor.userId, body.quoteId);
    const cart = await this.cartRepository.findCartByIdForActor(
      { type: 'user', userId: actor.userId },
      quote.cartId,
    );

    if (!cart || cart.kind !== CartKind.BUY_NOW) {
      throw new TemporaryCartNotFoundError();
    }

    if (!doesCartMatchCheckoutQuote(cart, quote)) {
      throw new CheckoutQuoteCartChangedError();
    }

    return this.orderCheckoutService.createOrders({
      type: 'user',
      userId: actor.userId,
      email: actor.email,
    }, cart.id, cart, {
      paymentType: body.paymentType,
      shippingAddress: quote.shippingAddress,
      shopAdjustments: quote.shopAdjustments,
      quote,
      isTempCart: true,
    });
  }
}
