import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { CartRepository } from '~/modules/domains/cart/app/ports/cart.repository';
import { CartKind } from '~/modules/domains/cart/domain/enums/cart-kind.enum';
import { GetMyAddressUseCase } from '~/modules/domains/user/app/use-cases/get-my-address/get-my-address.use-case';
import type { CreateOrderForBuyNowDto } from '../../../api/rest/dto/create-order-for-buy-now.dto';
import { OrderCheckoutService } from '../../order-checkout.service';

@Injectable()
export class CreateOrderForBuyNowUseCase {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly getMyAddressUseCase: GetMyAddressUseCase,
    private readonly orderCheckoutService: OrderCheckoutService
  ) {}

  async execute(actor: AuthenticatedUser, body: CreateOrderForBuyNowDto) {
    const cart = await this.cartRepository.findCartByIdForActor(
      { type: 'user', userId: actor.userId },
      body.cartId
    );

    if (!cart || cart.kind !== CartKind.BUY_NOW) {
      throw new NotFoundException('Temporary cart not found');
    }

    const address = await this.getMyAddressUseCase.execute(actor, body.userAddressId);

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    const firstShop = cart.items[0]?.inventory.shopId;
    const shopAdjustments = firstShop
      ? [{ shopId: firstShop, promoCodes: body.promoCodes, note: body.note }]
      : [];

    return this.orderCheckoutService.createOrders({
      type: 'user',
      userId: actor.userId,
      email: actor.email,
    }, cart.id, cart, {
      paymentType: body.paymentType,
      currency: body.currency,
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
      shopAdjustments,
      isTempCart: true,
    });
  }
}
