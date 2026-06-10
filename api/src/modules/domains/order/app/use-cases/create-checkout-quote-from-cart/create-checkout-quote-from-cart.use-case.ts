import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { UserPreferenceRepository } from '~/modules/domains/auth/app/ports/user-preference.repository';
import { CartRepository } from '~/modules/domains/cart/app/ports/cart.repository';
import { RequestContextService } from '~/modules/shared/request-context/request-context.service';
import { GetMyAddressUseCase } from '~/modules/domains/user/app/use-cases/get-my-address/get-my-address.use-case';
import type { CreateCheckoutQuoteFromCartDto } from '../../../api/rest/dto/create-checkout-quote-from-cart.dto';
import { AddressNotFoundError, CartNotFoundError } from '../../errors/order-app.error';
import { CreateCheckoutQuoteService } from '../../create-checkout-quote.service';

@Injectable()
export class CreateCheckoutQuoteFromCartUseCase {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly getMyAddressUseCase: GetMyAddressUseCase,
    private readonly userPreferenceRepository: UserPreferenceRepository,
    private readonly requestContextService: RequestContextService,
    private readonly createCheckoutQuoteService: CreateCheckoutQuoteService
  ) {}

  async execute(actor: AuthenticatedUser, body: CreateCheckoutQuoteFromCartDto) {
    const cart = await this.cartRepository.findActiveCart({
      type: 'user',
      userId: actor.userId,
    });

    if (!cart) {
      throw new CartNotFoundError();
    }

    const address = await this.getMyAddressUseCase.execute(actor, body.userAddressId);

    if (!address) {
      throw new AddressNotFoundError();
    }

    const userPreferences = await this.userPreferenceRepository.findByUserId(actor.userId);

    return this.createCheckoutQuoteService.createFromCart({
      actor: {
        type: 'user',
        userId: actor.userId,
      },
      cart,
      presentmentCurrency:
        body.presentmentCurrency ??
        userPreferences?.currency ??
        this.requestContextService.get().currency,
      shopAdjustments: body.shopAdjustments,
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
    });
  }
}
