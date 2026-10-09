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
  UseFilters,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { CHECKOUT_CONFIG, type CheckoutConfig } from '~/platform/config/checkout.config';
import { GuestCartSessionService } from '~/domains/cart/api/rest/cookies/guest-cart-session.service';
import { CreateGuestCheckoutQuoteForBuyNowUseCase } from '~/domains/checkout/app/use-cases/create-guest-checkout-quote-for-buy-now/create-guest-checkout-quote-for-buy-now.use-case';
import { CreateGuestOrderForBuyNowUseCase } from '~/domains/checkout/app/use-cases/create-guest-order-for-buy-now/create-guest-order-for-buy-now.use-case';
import { CreateGuestCheckoutQuoteFromCartUseCase } from '~/domains/checkout/app/use-cases/create-guest-checkout-quote-from-cart/create-guest-checkout-quote-from-cart.use-case';
import { CreateGuestOrderFromCartUseCase } from '~/domains/checkout/app/use-cases/create-guest-order-from-cart/create-guest-order-from-cart.use-case';
import { CheckoutPublicIdResolver } from '../../app/services/checkout-public-id.resolver';
import { GuestOrderTrackingTokenService } from '../../app/services/guest-order-tracking-token.service';
import { GetOrdersByCheckoutSessionUseCase } from '~/domains/checkout/app/use-cases/get-orders-by-checkout-session/get-orders-by-checkout-session.use-case';
import { LookupGuestOrdersUseCase } from '~/domains/checkout/app/use-cases/lookup-guest-orders/lookup-guest-orders.use-case';
import {
  CheckoutOrderListResponseDto,
  CheckoutQuoteResponseDto,
  CheckoutSessionOrderResponseDto,
  CreateOrderResponseDto,
  toCheckoutQuoteResponse,
  toCheckoutSessionOrderResponse,
  toCreateOrderResponse,
  toCheckoutOrderListResponse,
} from './responses/checkout.response';
import { CreateGuestCheckoutQuoteForBuyNowDto } from './dto/create-guest-checkout-quote-for-buy-now.dto';
import { CreateGuestCheckoutQuoteFromCartDto } from './dto/create-guest-checkout-quote-from-cart.dto';
import { CreateGuestOrderForBuyNowDto } from './dto/create-guest-order-for-buy-now.dto';
import { CreateGuestOrderFromCartDto } from './dto/create-guest-order-from-cart.dto';
import { LookupGuestOrdersQueryDto } from './dto/lookup-guest-orders.query.dto';
import { CheckoutExceptionsFilter } from './errors/checkout-exceptions.filter';
import { checkoutControllerErrorResponses } from './errors/checkout-error-responses';

const checkoutRouteRateLimits = {
  guestLookup: {
    limit: 5,
    ttl: 60_000,
    blockDuration: 300_000,
  },
} as const;

@Controller('checkout')
@UseFilters(CheckoutExceptionsFilter)
@ApiTags('Checkout')
@ApiErrorResponses(checkoutControllerErrorResponses.controller)
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
    private readonly checkoutPublicIdResolver: CheckoutPublicIdResolver,
  ) {}

  @Get('session/:session_id')
  @ApiOperation({
    summary: 'Get session orders',
    description: 'Returns orders associated with the guest checkout session.',
  })
  @ApiParam({ name: 'session_id', type: String })
  @ApiOkResponse({
    description: 'Checkout session orders.',
    type: CheckoutSessionOrderResponseDto,
  })
  @ApiErrorResponses(checkoutControllerErrorResponses.getBySession)
  async getBySession(@Param('session_id') sessionId: string) {
    return toCheckoutSessionOrderResponse(
      await this.getOrdersByCheckoutSessionUseCase.execute(sessionId),
    );
  }

  @Get('guest-orders')
  @Throttle({
    default: checkoutRouteRateLimits.guestLookup,
  })
  @ApiOperation({
    summary: 'Find guest orders',
    description: 'Looks up guest orders using the supplied tracking token or order details.',
  })
  @ApiOkResponse({
    description: 'Matching guest orders.',
    type: CheckoutOrderListResponseDto,
  })
  @ApiErrorResponses(checkoutControllerErrorResponses.lookupGuestOrders)
  async lookupGuestOrders(@Query() query: LookupGuestOrdersQueryDto) {
    query.validate();

    const resolvedLookup = query.token
      ? this.guestOrderTrackingTokenService.resolve(query.token)
      : {
        email: query.email,
        orderId: query.orderId
          ? await this.checkoutPublicIdResolver.resolveOrderId(query.orderId)
          : undefined,
        orderIds: query.orderIds
          ? await this.checkoutPublicIdResolver.resolveOrderIds(
            query.orderIds.split(',').map((value) => value.trim()).filter(Boolean),
          )
          : undefined,
        sessionId: query.sessionId,
        zip: query.zip,
      };

    if ('sessionId' in resolvedLookup && resolvedLookup.sessionId) {
      await this.getOrdersByCheckoutSessionUseCase.execute(resolvedLookup.sessionId);
    }

    return toCheckoutOrderListResponse(
      await this.lookupGuestOrdersUseCase.execute(resolvedLookup),
    );
  }

  @Post('cart/quote')
  @ApiOperation({
    summary: 'Create cart quote',
    description: 'Creates a checkout quote from the guest cart.',
  })
  @ApiOkResponse({
    description: 'Guest checkout quote.',
    type: CheckoutQuoteResponseDto,
  })
  @ApiErrorResponses(checkoutControllerErrorResponses.createQuoteFromCart)
  async createQuoteFromCart(
    @Req() request: Request,
    @Body() body: CreateGuestCheckoutQuoteFromCartDto,
  ) {
    const guestSessionId = this.guestCartSessionService.extractSessionId(request);

    if (!guestSessionId) {
      throw new NotFoundException({
        code: 'GUEST_CART_SESSION_NOT_FOUND',
        message: 'Guest cart session not found',
      });
    }

    return toCheckoutQuoteResponse(
      await this.createGuestCheckoutQuoteFromCartUseCase.execute(
        guestSessionId,
        await this.checkoutPublicIdResolver.resolveCheckoutQuoteShopIds(body),
      ),
      this.checkoutConfig,
    );
  }

  @Post('cart')
  @ApiOperation({
    summary: 'Create cart order',
    description: 'Creates a guest order from the guest cart.',
  })
  @ApiOkResponse({
    description: 'Created guest order.',
    type: CreateOrderResponseDto,
  })
  @ApiErrorResponses(checkoutControllerErrorResponses.createFromCart)
  async createFromCart(
    @Req() request: Request,
    @Body() body: CreateGuestOrderFromCartDto,
  ) {
    const guestSessionId = this.guestCartSessionService.extractSessionId(request);

    if (!guestSessionId) {
      throw new NotFoundException({
        code: 'GUEST_CART_SESSION_NOT_FOUND',
        message: 'Guest cart session not found',
      });
    }

    return toCreateOrderResponse(
      await this.createGuestOrderFromCartUseCase.execute(guestSessionId, body),
    );
  }

  @Post('buy-now/quote')
  @ApiOperation({
    summary: 'Create buy-now quote',
    description: 'Creates a checkout quote for a guest buy-now purchase.',
  })
  @ApiOkResponse({
    description: 'Guest checkout quote.',
    type: CheckoutQuoteResponseDto,
  })
  @ApiErrorResponses(checkoutControllerErrorResponses.createQuoteForBuyNow)
  async createQuoteForBuyNow(
    @Req() request: Request,
    @Body() body: CreateGuestCheckoutQuoteForBuyNowDto,
  ) {
    const guestSessionId = this.guestCartSessionService.extractSessionId(request);

    if (!guestSessionId) {
      throw new NotFoundException({
        code: 'GUEST_CART_SESSION_NOT_FOUND',
        message: 'Guest cart session not found',
      });
    }

    return toCheckoutQuoteResponse(
      await this.createGuestCheckoutQuoteForBuyNowUseCase.execute(guestSessionId, body),
      this.checkoutConfig,
    );
  }

  @Post('buy-now')
  @ApiOperation({
    summary: 'Create buy-now order',
    description: 'Creates a guest order for a buy-now purchase.',
  })
  @ApiOkResponse({
    description: 'Created guest order.',
    type: CreateOrderResponseDto,
  })
  @ApiErrorResponses(checkoutControllerErrorResponses.createForBuyNow)
  async createForBuyNow(
    @Req() request: Request,
    @Body() body: CreateGuestOrderForBuyNowDto,
  ) {
    const guestSessionId = this.guestCartSessionService.extractSessionId(request);

    if (!guestSessionId) {
      throw new NotFoundException({
        code: 'GUEST_CART_SESSION_NOT_FOUND',
        message: 'Guest cart session not found',
      });
    }

    return toCreateOrderResponse(
      await this.createGuestOrderForBuyNowUseCase.execute(guestSessionId, body),
    );
  }
}
