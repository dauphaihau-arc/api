import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { CartRepository } from '~/modules/domains/cart/app/ports/cart.repository';
import { GetMyAddressUseCase } from '~/modules/domains/user/app/use-cases/get-my-address/get-my-address.use-case';
import type { CreateOrderFromCartDto } from '../../../api/rest/dto/create-order-from-cart.dto';
import { OrderCheckoutService } from '../../order-checkout.service';

@Injectable()
export class CreateOrderFromCartUseCase {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly getMyAddressUseCase: GetMyAddressUseCase,
    private readonly orderCheckoutService: OrderCheckoutService
  ) {}

  async execute(actor: AuthenticatedUser, body: CreateOrderFromCartDto) {
    const cart = await this.cartRepository.findActiveCart({
      type: 'user',
      userId: actor.userId,
    });

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    const address = await this.getMyAddressUseCase.execute(actor, body.userAddressId);

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    return this.orderCheckoutService.createOrders(actor.userId, actor.email, cart.id, cart, {
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
      shopAdjustments: body.shopAdjustments,
      isTempCart: false,
    });
  }
}
