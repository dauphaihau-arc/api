import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { CartRepository } from '~/modules/domains/cart/app/ports/cart.repository';
import { doesCartMatchCheckoutQuote } from '../../checkout-quote-cart-matcher';
import type { CreateOrderFromCartDto } from '../../../api/rest/dto/create-order-from-cart.dto';
import {
  CartNotFoundError,
  CheckoutQuoteCartChangedError,
} from '../../errors/order-app.error';
import { LoadCheckoutQuoteService } from '../../load-checkout-quote.service';
import { OrderCheckoutService } from '../../order-checkout.service';

@Injectable()
export class CreateOrderFromCartUseCase {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly loadCheckoutQuoteService: LoadCheckoutQuoteService,
    private readonly orderCheckoutService: OrderCheckoutService,
  ) {}

  async execute(actor: AuthenticatedUser, body: CreateOrderFromCartDto) {
    const quote = await this.loadCheckoutQuoteService.loadForUser(actor.userId, body.quoteId);
    const cart = await this.cartRepository.findCartByIdForActor({
      type: 'user',
      userId: actor.userId,
    }, quote.cartId);

    if (!cart) {
      throw new CartNotFoundError();
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
      isTempCart: false,
    });
  }
}
