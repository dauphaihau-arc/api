import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { CartRepository } from '~/modules/domains/cart/app/ports/cart.repository';
import { CartKind } from '~/modules/domains/cart/domain/enums/cart-kind.enum';
import { GetMyAddressUseCase } from '~/modules/domains/user/app/use-cases/get-my-address/get-my-address.use-case';
import type { CreateCheckoutQuoteForBuyNowDto } from '../../../api/rest/dto/create-checkout-quote-for-buy-now.dto';
import {
  AddressNotFoundError,
  TemporaryCartNotFoundError,
} from '../../../../order/app/errors/order-app.error';
import { CreateCheckoutQuoteService } from '../../create-checkout-quote.service';

@Injectable()
export class CreateCheckoutQuoteForBuyNowUseCase {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly getMyAddressUseCase: GetMyAddressUseCase,
    private readonly createCheckoutQuoteService: CreateCheckoutQuoteService,
  ) {}

  async execute(actor: AuthenticatedUser, body: CreateCheckoutQuoteForBuyNowDto) {
    const cart = await this.cartRepository.findCartByIdForActor(
      { type: 'user', userId: actor.userId },
      body.cartId,
    );

    if (!cart || cart.kind !== CartKind.BUY_NOW) {
      throw new TemporaryCartNotFoundError();
    }

    const address = await this.getMyAddressUseCase.execute(actor, body.userAddressId);

    if (!address) {
      throw new AddressNotFoundError();
    }

    const firstShop = cart.items[0]?.inventory.shopId;
    const shopAdjustments = firstShop
      ? [{ shopId: firstShop, promoCodes: body.promoCodes, note: body.note }]
      : [];

    return this.createCheckoutQuoteService.createFromCart({
      actor: {
        type: 'user',
        userId: actor.userId,
      },
      cart,
      shippingAddress: {
        fullName: address.fullName,
        address1: address.address1,
        address2: address.address2,
        city: address.city,
        country: address.country,
        state: address.state,
        zip: address.zip,
        phone: address.phone,
      },
      presentmentCurrency: body.presentmentCurrency,
      shopAdjustments,
    });
  }
}
