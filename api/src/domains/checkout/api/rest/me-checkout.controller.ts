import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Put,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '~/platform/decorators/current-user.decorator';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { CHECKOUT_CONFIG, type CheckoutConfig } from '~/platform/config/checkout.config';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import {
  CheckoutQuoteResponseDto,
  CheckoutSessionOrderResponseDto,
  CreateOrderResponseDto,
  toCheckoutQuoteResponse,
  toCheckoutSessionOrderResponse,
  toCreateOrderResponse,
} from './responses/checkout.response';
import { CheckoutPublicIdResolver } from '../../app/services/checkout-public-id.resolver';
import { CreateCheckoutQuoteForBuyNowUseCase } from '../../app/use-cases/create-checkout-quote-for-buy-now/create-checkout-quote-for-buy-now.use-case';
import { CreateCheckoutQuoteFromCartUseCase } from '../../app/use-cases/create-checkout-quote-from-cart/create-checkout-quote-from-cart.use-case';
import { CreateOrderForBuyNowUseCase } from '../../app/use-cases/create-order-for-buy-now/create-order-for-buy-now.use-case';
import { CreateOrderFromCartUseCase } from '../../app/use-cases/create-order-from-cart/create-order-from-cart.use-case';
import { GetOrdersByCheckoutSessionUseCase } from '../../app/use-cases/get-orders-by-checkout-session/get-orders-by-checkout-session.use-case';
import { GetCheckoutSessionReadinessUseCase } from '../../app/use-cases/get-checkout-session-readiness/get-checkout-session-readiness.use-case';
import { CreateCheckoutQuoteForBuyNowDto } from './dto/create-checkout-quote-for-buy-now.dto';
import { CreateCheckoutQuoteFromCartDto } from './dto/create-checkout-quote-from-cart.dto';
import { CreateOrderForBuyNowDto } from './dto/create-order-for-buy-now.dto';
import { CreateOrderFromCartDto } from './dto/create-order-from-cart.dto';
import { CheckoutExceptionsFilter } from './errors/checkout-exceptions.filter';
import { meCheckoutControllerErrorResponses } from './errors/checkout-error-responses';

@Controller('me/checkout')
@UseFilters(CheckoutExceptionsFilter)
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags('My Checkout')
@ApiCookieAuth('accessCookie')
@ApiErrorResponses(meCheckoutControllerErrorResponses.controller)
export class MeCheckoutController {
  constructor(
    @Inject(CHECKOUT_CONFIG)
    private readonly checkoutConfig: CheckoutConfig,
    private readonly createCheckoutQuoteFromCartUseCase: CreateCheckoutQuoteFromCartUseCase,
    private readonly createCheckoutQuoteForBuyNowUseCase: CreateCheckoutQuoteForBuyNowUseCase,
    private readonly createOrderFromCartUseCase: CreateOrderFromCartUseCase,
    private readonly createOrderForBuyNowUseCase: CreateOrderForBuyNowUseCase,
    private readonly getOrdersByCheckoutSessionUseCase: GetOrdersByCheckoutSessionUseCase,
    private readonly getCheckoutSessionReadinessUseCase: GetCheckoutSessionReadinessUseCase,
    private readonly checkoutPublicIdResolver: CheckoutPublicIdResolver,
  ) {}

  @Post('quote')
  @ApiOperation({
    summary: 'Create cart quote',
    description: 'Creates a checkout quote from the signed-in user’s cart.',
  })
  @ApiOkResponse({
    description: 'Checkout quote.',
    type: CheckoutQuoteResponseDto,
  })
  @ApiErrorResponses(meCheckoutControllerErrorResponses.createQuoteFromCart)
  async createQuoteFromCart(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateCheckoutQuoteFromCartDto,
  ) {
    return toCheckoutQuoteResponse(
      await this.createCheckoutQuoteFromCartUseCase.execute(
        currentUser,
        await this.checkoutPublicIdResolver.resolveCheckoutQuoteShopIds(body),
      ),
      this.checkoutConfig,
    );
  }

  @Post('buy-now/quote')
  @ApiOperation({
    summary: 'Create buy-now quote',
    description: 'Creates a checkout quote for a buy-now purchase.',
  })
  @ApiOkResponse({
    description: 'Checkout quote.',
    type: CheckoutQuoteResponseDto,
  })
  @ApiErrorResponses(meCheckoutControllerErrorResponses.createQuoteForBuyNow)
  async createQuoteForBuyNow(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateCheckoutQuoteForBuyNowDto,
  ) {
    return toCheckoutQuoteResponse(
      await this.createCheckoutQuoteForBuyNowUseCase.execute(currentUser, body),
      this.checkoutConfig,
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Create cart order',
    description: 'Creates an order from the signed-in user’s cart.',
  })
  @ApiOkResponse({
    description: 'Created order.',
    type: CreateOrderResponseDto,
  })
  @ApiErrorResponses(meCheckoutControllerErrorResponses.createFromCart)
  async createFromCart(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateOrderFromCartDto,
  ) {
    return toCreateOrderResponse(
      await this.createOrderFromCartUseCase.execute(currentUser, body),
    );
  }

  @Put('buy-now')
  @ApiOperation({
    summary: 'Create buy-now order',
    description: 'Creates an order for a buy-now purchase.',
  })
  @ApiOkResponse({
    description: 'Created order.',
    type: CreateOrderResponseDto,
  })
  @ApiErrorResponses(meCheckoutControllerErrorResponses.createForBuyNow)
  async createForBuyNow(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateOrderForBuyNowDto,
  ) {
    return toCreateOrderResponse(
      await this.createOrderForBuyNowUseCase.execute(currentUser, body),
    );
  }

  @Get('session/readiness')
  @ApiOperation({
    summary: 'Get session readiness',
    description: 'Returns checkout-session readiness for the requested order IDs.',
  })
  @ApiQuery({ name: 'order_ids', required: true, type: String })
  @ApiOkResponse({
    description: 'Checkout session readiness.',
    type: CreateOrderResponseDto,
  })
  @ApiErrorResponses(meCheckoutControllerErrorResponses.getCheckoutSessionReadiness)
  async getCheckoutSessionReadiness(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query('order_ids') orderIds: string | undefined,
  ) {
    const parsedOrderIds = (orderIds ?? '')
      .split(',')
      .map((orderId) => orderId.trim())
      .filter(Boolean);

    return toCreateOrderResponse(
      await this.getCheckoutSessionReadinessUseCase.execute(
        currentUser,
        parsedOrderIds,
      ),
    );
  }

  @Get('session')
  @ApiOperation({
    summary: 'Get session orders',
    description: 'Returns orders associated with the checkout session.',
  })
  @ApiQuery({ name: 'session_id', required: false, type: String })
  @ApiOkResponse({
    description: 'Checkout session orders.',
    type: CheckoutSessionOrderResponseDto,
  })
  @ApiErrorResponses(meCheckoutControllerErrorResponses.getByCheckoutSession)
  async getByCheckoutSession(@Query('session_id') sessionId?: string) {
    return toCheckoutSessionOrderResponse(
      await this.getOrdersByCheckoutSessionUseCase.execute(sessionId ?? ''),
    );
  }
}
