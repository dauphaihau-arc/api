import { Injectable } from '@nestjs/common';
import { CartRepository } from '~/domains/cart/app/ports/cart.repository';
import { CartKind } from '~/domains/cart/domain/enums/cart-kind.enum';
import type { CreateGuestCheckoutQuoteForBuyNowDto } from '../../../api/rest/dto/create-guest-checkout-quote-for-buy-now.dto';
import { TemporaryCartNotFoundError } from '../../../../order/app/errors/order-app.error';
import { CreateCheckoutQuoteService } from '../../services/create-checkout-quote.service';

@Injectable()
export class CreateGuestCheckoutQuoteForBuyNowUseCase {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly createCheckoutQuoteService: CreateCheckoutQuoteService,
  ) {}

  async execute(guestSessionId: string, body: CreateGuestCheckoutQuoteForBuyNowDto) {
    const cart = await this.cartRepository.findCartByIdForActor(
      { type: 'guest', guestSessionId },
      body.cartId,
    );

    if (!cart || cart.kind !== CartKind.BUY_NOW) {
      throw new TemporaryCartNotFoundError();
    }

    const firstShop = cart.items[0]?.inventory.shopId;
    const shopAdjustments = firstShop
      ? [{ shopId: firstShop, promoCodes: body.promoCodes, note: body.note }]
      : [];

    return this.createCheckoutQuoteService.createFromCart({
      actor: {
        type: 'guest',
        guestSessionId,
      },
      cart,
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
      presentmentCurrency: body.presentmentCurrency,
      shopAdjustments,
    });
  }
}
