import {
  Inject,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CHECKOUT_CONFIG, type CheckoutConfig } from '~/platform/config/checkout.config';
import { GuestCartSessionService } from '~/domains/cart/api/rest/guest-cart-session.service';
import { CreateGuestCheckoutQuoteForBuyNowUseCase } from '~/domains/checkout/app/use-cases/create-guest-checkout-quote-for-buy-now/create-guest-checkout-quote-for-buy-now.use-case';
import { CreateGuestOrderForBuyNowUseCase } from '~/domains/checkout/app/use-cases/create-guest-order-for-buy-now/create-guest-order-for-buy-now.use-case';
import { CreateGuestCheckoutQuoteFromCartUseCase } from '~/domains/checkout/app/use-cases/create-guest-checkout-quote-from-cart/create-guest-checkout-quote-from-cart.use-case';
import { CreateGuestOrderFromCartUseCase } from '~/domains/checkout/app/use-cases/create-guest-order-from-cart/create-guest-order-from-cart.use-case';
import { GuestOrderTrackingTokenService } from '../../app/services/guest-order-tracking-token.service';
import { GetOrdersByCheckoutSessionUseCase } from '~/domains/checkout/app/use-cases/get-orders-by-checkout-session/get-orders-by-checkout-session.use-case';
import { LookupGuestOrdersUseCase } from '~/domains/checkout/app/use-cases/lookup-guest-orders/lookup-guest-orders.use-case';
import {
  isCheckoutAppError,
  mapCheckoutAppErrorToHttpException,
} from './checkout-http-error-mapper';
import {
  toCheckoutQuoteResponse,
  toCheckoutSessionOrderResponse,
  toCreateOrderResponse,
  toCheckoutOrderListResponse,
} from './checkout.response';
import { CreateGuestCheckoutQuoteForBuyNowDto } from './dto/create-guest-checkout-quote-for-buy-now.dto';
import { CreateGuestCheckoutQuoteFromCartDto } from './dto/create-guest-checkout-quote-from-cart.dto';
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
@ApiTags('Checkout')
export class CheckoutController {
  constructor(
    @Inject(CHECKOUT_CONFIG)
    private readonly checkoutConfig: CheckoutConfig,
    private readonly guestCartSessionService: GuestCartSessionService,
    private readonly createGuestCheckoutQuoteFromCartUseCase: CreateGuestCheckoutQuoteFromCartUseCase,
    private readonly createGuestCheckoutQuoteForBuyNowUseCase: CreateGuestCheckoutQuoteForBuyNowUseCase,
    private readonly createGuestOrderFromCartUseCase: CreateGuestOrderFromCartUseCase,
    private readonly createGuestOrderForBuyNowUseCase: CreateGuestOrderForBuyNowUseCase,
    private readonly getOrdersByCheckoutSessionUseCase: GetOrdersByCheckoutSessionUseCase,
    private readonly guestOrderTrackingTokenService: GuestOrderTrackingTokenService,
    private readonly lookupGuestOrdersUseCase: LookupGuestOrdersUseCase,
  ) {}

  @Get('session/:session_id')
  @ApiOperation({ summary: 'Get guest checkout session orders' })
  @ApiParam({ name: 'session_id', type: String })
  @ApiOkResponse({
    description: 'Checkout session orders.',
    schema: { type: 'object' },
  })
  async getBySession(@Param('session_id') sessionId: string) {
    try {
      return toCheckoutSessionOrderResponse(
        await this.getOrdersByCheckoutSessionUseCase.execute(sessionId),
      );
    }
    catch (error) {
      this.throwMappedOrderError(error);
    }
  }

  @Get('guest-orders')
  @Throttle({
    default: checkoutRouteRateLimits.guestLookup,
  })
  @ApiOperation({ summary: 'Look up guest orders' })
  @ApiOkResponse({
    description: 'Matching guest orders.',
    schema: { type: 'object' },
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
      try {
        await this.getOrdersByCheckoutSessionUseCase.execute(resolvedLookup.sessionId);
      }
      catch (error) {
        this.throwMappedOrderError(error);
      }
    }

    return this.lookupGuestOrdersUseCase.execute(resolvedLookup)
      .then(toCheckoutOrderListResponse);
  }

  @Post('cart/quote')
  @ApiOperation({ summary: 'Create a guest checkout quote from the guest cart' })
  @ApiOkResponse({
    description: 'Guest checkout quote.',
    schema: { type: 'object' },
  })
  @ApiNotFoundResponse({ description: 'Guest cart session not found.' })
  async createQuoteFromCart(
    @Req() request: Request,
    @Body() body: CreateGuestCheckoutQuoteFromCartDto,
  ) {
    const guestSessionId = this.guestCartSessionService.extractSessionId(request);

    if (!guestSessionId) {
      throw new NotFoundException('Guest cart session not found');
    }

    try {
      return toCheckoutQuoteResponse(
        await this.createGuestCheckoutQuoteFromCartUseCase.execute(guestSessionId, body),
        this.checkoutConfig,
      );
    }
    catch (error) {
      this.throwMappedOrderError(error);
    }
  }

  @Post('cart')
  @ApiOperation({ summary: 'Create a guest order from the guest cart' })
  @ApiOkResponse({
    description: 'Created guest order.',
    schema: { type: 'object' },
  })
  @ApiNotFoundResponse({ description: 'Guest cart session not found.' })
  async createFromCart(
    @Req() request: Request,
    @Body() body: CreateGuestOrderFromCartDto,
  ) {
    const guestSessionId = this.guestCartSessionService.extractSessionId(request);

    if (!guestSessionId) {
      throw new NotFoundException('Guest cart session not found');
    }

    try {
      return toCreateOrderResponse(
        await this.createGuestOrderFromCartUseCase.execute(guestSessionId, body),
      );
    }
    catch (error) {
      this.throwMappedOrderError(error);
    }
  }

  @Post('buy-now/quote')
  @ApiOperation({ summary: 'Create a guest checkout quote for buy now' })
  @ApiOkResponse({
    description: 'Guest checkout quote.',
    schema: { type: 'object' },
  })
  @ApiNotFoundResponse({ description: 'Guest cart session not found.' })
  async createQuoteForBuyNow(
    @Req() request: Request,
    @Body() body: CreateGuestCheckoutQuoteForBuyNowDto,
  ) {
    const guestSessionId = this.guestCartSessionService.extractSessionId(request);

    if (!guestSessionId) {
      throw new NotFoundException('Guest cart session not found');
    }

    try {
      return toCheckoutQuoteResponse(
        await this.createGuestCheckoutQuoteForBuyNowUseCase.execute(guestSessionId, body),
        this.checkoutConfig,
      );
    }
    catch (error) {
      this.throwMappedOrderError(error);
    }
  }

  @Post('buy-now')
  @ApiOperation({ summary: 'Create a guest order for buy now' })
  @ApiOkResponse({
    description: 'Created guest order.',
    schema: { type: 'object' },
  })
  @ApiNotFoundResponse({ description: 'Guest cart session not found.' })
  async createForBuyNow(
    @Req() request: Request,
    @Body() body: CreateGuestOrderForBuyNowDto,
  ) {
    const guestSessionId = this.guestCartSessionService.extractSessionId(request);

    if (!guestSessionId) {
      throw new NotFoundException('Guest cart session not found');
    }

    try {
      return toCreateOrderResponse(
        await this.createGuestOrderForBuyNowUseCase.execute(guestSessionId, body),
      );
    }
    catch (error) {
      this.throwMappedOrderError(error);
    }
  }

  private throwMappedOrderError(error: unknown): never {
    if (isCheckoutAppError(error)) {
      throw mapCheckoutAppErrorToHttpException(error);
    }

    throw error;
  }
}
