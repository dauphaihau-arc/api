import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { GuestCartSessionService } from '~/modules/domains/cart/api/rest/guest-cart-session.service';
import { CreateGuestOrderForBuyNowUseCase } from '../../app/use-cases/create-guest-order-for-buy-now/create-guest-order-for-buy-now.use-case';
import { CreateGuestOrderFromCartUseCase } from '../../app/use-cases/create-guest-order-from-cart/create-guest-order-from-cart.use-case';
import { GuestOrderTrackingTokenService } from '../../app/guest-order-tracking-token.service';
import { GetOrdersByCheckoutSessionUseCase } from '../../app/use-cases/get-orders-by-checkout-session/get-orders-by-checkout-session.use-case';
import { LookupGuestOrdersUseCase } from '../../app/use-cases/lookup-guest-orders/lookup-guest-orders.use-case';
import {
  toCheckoutSessionOrderResponse,
  toCreateOrderResponse,
  toOrderListResponse,
} from './order.response';
import { CreateGuestOrderForBuyNowDto } from './dto/create-guest-order-for-buy-now.dto';
import { CreateGuestOrderFromCartDto } from './dto/create-guest-order-from-cart.dto';
import { LookupGuestOrdersQueryDto } from './dto/lookup-guest-orders.query.dto';

const checkoutRouteRateLimits = {
  guestLookup: {
    limit: 5,
    ttl: 60_000,
    blockDuration: 300_000,
  },
} as const;

@Controller('checkout')
export class CheckoutController {
  constructor(
    private readonly guestCartSessionService: GuestCartSessionService,
    private readonly createGuestOrderFromCartUseCase: CreateGuestOrderFromCartUseCase,
    private readonly createGuestOrderForBuyNowUseCase: CreateGuestOrderForBuyNowUseCase,
    private readonly getOrdersByCheckoutSessionUseCase: GetOrdersByCheckoutSessionUseCase,
    private readonly guestOrderTrackingTokenService: GuestOrderTrackingTokenService,
    private readonly lookupGuestOrdersUseCase: LookupGuestOrdersUseCase
  ) {}

  @Get('session/:sessionId')
  async getBySession(@Param('sessionId') sessionId: string) {
    return this.getOrdersByCheckoutSessionUseCase.execute(sessionId)
      .then(toCheckoutSessionOrderResponse);
  }

  @Get('guest-orders')
  @Throttle({
    default: checkoutRouteRateLimits.guestLookup,
  })
  async lookupGuestOrders(@Query() query: LookupGuestOrdersQueryDto) {
    query.validate();

    const resolvedLookup = query.token
      ? this.guestOrderTrackingTokenService.resolve(query.token)
      : {
        email: query.email,
        orderId: query.orderId,
        orderIds: query.orderIds
          ? query.orderIds.split(',').map((value) => value.trim()).filter(Boolean)
          : undefined,
        sessionId: query.sessionId,
        zip: query.zip,
      };

    if ('sessionId' in resolvedLookup && resolvedLookup.sessionId) {
      await this.getOrdersByCheckoutSessionUseCase.execute(resolvedLookup.sessionId);
    }

    return this.lookupGuestOrdersUseCase.execute(resolvedLookup)
      .then(toOrderListResponse);
  }

  @Post('cart')
  async createFromCart(
    @Req() request: Request,
    @Body() body: CreateGuestOrderFromCartDto
  ) {
    const guestSessionId = this.guestCartSessionService.extractSessionId(request);

    if (!guestSessionId) {
      throw new NotFoundException('Guest cart session not found');
    }

    return this.createGuestOrderFromCartUseCase.execute(guestSessionId, body)
      .then(toCreateOrderResponse);
  }

  @Post('buy-now')
  async createForBuyNow(
    @Req() request: Request,
    @Body() body: CreateGuestOrderForBuyNowDto
  ) {
    const guestSessionId = this.guestCartSessionService.extractSessionId(request);

    if (!guestSessionId) {
      throw new NotFoundException('Guest cart session not found');
    }

    return this.createGuestOrderForBuyNowUseCase.execute(guestSessionId, body)
      .then(toCreateOrderResponse);
  }
}
