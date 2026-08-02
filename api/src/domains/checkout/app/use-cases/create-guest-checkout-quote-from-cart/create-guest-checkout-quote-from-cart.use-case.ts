import { Injectable } from '@nestjs/common';
import { CartRepository } from '~/domains/cart/app/ports/cart.repository';
import type { CreateGuestCheckoutQuoteFromCartDto } from '../../../api/rest/dto/create-guest-checkout-quote-from-cart.dto';
import { CartNotFoundError } from '../../../../order/app/errors/order-app.error';
import { CreateCheckoutQuoteService } from '../../services/create-checkout-quote.service';

@Injectable()
export class CreateGuestCheckoutQuoteFromCartUseCase {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly createCheckoutQuoteService: CreateCheckoutQuoteService,
  ) {}

  async execute(guestSessionId: string, body: CreateGuestCheckoutQuoteFromCartDto) {
    const cart = await this.cartRepository.findActiveCart({
      type: 'guest',
      guestSessionId,
    });

    if (!cart) {
      throw new CartNotFoundError();
    }

    return this.createCheckoutQuoteService.createFromCart({
      actor: {
        type: 'guest',
        guestSessionId,
      },
      cart,
      presentmentCurrency: body.presentmentCurrency,
      shopAdjustments: body.shopAdjustments,
      shippingAddress: {
        fullName: body.shippingAddress.fullName,
        address1: body.shippingAddress.address1,
        address2: body.shippingAddress.address2,
        city: body.shippingAddress.city,
        country: body.shippingAddress.country,
        state: body.shippingAddress.state,
        zip: body.shippingAddress.zip,
        phone: body.shippingAddress.phone,
      },
    });
  }
}
