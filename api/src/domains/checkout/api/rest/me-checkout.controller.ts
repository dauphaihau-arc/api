import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Put,
  Query,
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
import { CHECKOUT_CONFIG, type CheckoutConfig } from '~/platform/config/checkout.config';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import {
  isCheckoutAppError,
  mapCheckoutAppErrorToHttpException,
} from './checkout-http-error-mapper';
import {
  toCheckoutQuoteResponse,
  toCheckoutSessionOrderResponse,
  toCreateOrderResponse,
} from './checkout.response';
import { CreateCheckoutQuoteForBuyNowUseCase } from '../../app/use-cases/create-checkout-quote-for-buy-now/create-checkout-quote-for-buy-now.use-case';
import { CreateCheckoutQuoteFromCartUseCase } from '../../app/use-cases/create-checkout-quote-from-cart/create-checkout-quote-from-cart.use-case';
import { CreateOrderForBuyNowUseCase } from '../../app/use-cases/create-order-for-buy-now/create-order-for-buy-now.use-case';
import { CreateOrderFromCartUseCase } from '../../app/use-cases/create-order-from-cart/create-order-from-cart.use-case';
import { GetOrdersByCheckoutSessionUseCase } from '../../app/use-cases/get-orders-by-checkout-session/get-orders-by-checkout-session.use-case';
import { CreateCheckoutQuoteForBuyNowDto } from './dto/create-checkout-quote-for-buy-now.dto';
import { CreateCheckoutQuoteFromCartDto } from './dto/create-checkout-quote-from-cart.dto';
import { CreateOrderForBuyNowDto } from './dto/create-order-for-buy-now.dto';
import { CreateOrderFromCartDto } from './dto/create-order-from-cart.dto';

@Controller('me/checkout')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags('My Checkout')
@ApiCookieAuth('accessCookie')
export class MeCheckoutController {
  constructor(
    @Inject(CHECKOUT_CONFIG)
    private readonly checkoutConfig: CheckoutConfig,
    private readonly createCheckoutQuoteFromCartUseCase: CreateCheckoutQuoteFromCartUseCase,
    private readonly createCheckoutQuoteForBuyNowUseCase: CreateCheckoutQuoteForBuyNowUseCase,
    private readonly createOrderFromCartUseCase: CreateOrderFromCartUseCase,
    private readonly createOrderForBuyNowUseCase: CreateOrderForBuyNowUseCase,
    private readonly getOrdersByCheckoutSessionUseCase: GetOrdersByCheckoutSessionUseCase,
  ) {}

  @Post('quote')
  @ApiOperation({ summary: 'Create a checkout quote from my cart' })
  @ApiOkResponse({
    description: 'Checkout quote.',
    schema: { type: 'object' },
  })
  async createQuoteFromCart(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateCheckoutQuoteFromCartDto,
  ) {
    try {
      return toCheckoutQuoteResponse(
        await this.createCheckoutQuoteFromCartUseCase.execute(currentUser, body),
        this.checkoutConfig,
      );
    }
    catch (error) {
      this.throwMappedCheckoutError(error);
    }
  }

  @Post('buy-now/quote')
  @ApiOperation({ summary: 'Create a buy-now checkout quote' })
  @ApiOkResponse({
    description: 'Checkout quote.',
    schema: { type: 'object' },
  })
  async createQuoteForBuyNow(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateCheckoutQuoteForBuyNowDto,
  ) {
    try {
      return toCheckoutQuoteResponse(
        await this.createCheckoutQuoteForBuyNowUseCase.execute(currentUser, body),
        this.checkoutConfig,
      );
    }
    catch (error) {
      this.throwMappedCheckoutError(error);
    }
  }

  @Post()
  @ApiOperation({ summary: 'Create an order from my cart' })
  @ApiOkResponse({
    description: 'Created order.',
    schema: { type: 'object' },
  })
  async createFromCart(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateOrderFromCartDto,
  ) {
    try {
      return toCreateOrderResponse(
        await this.createOrderFromCartUseCase.execute(currentUser, body),
      );
    }
    catch (error) {
      this.throwMappedCheckoutError(error);
    }
  }

  @Put('buy-now')
  @ApiOperation({ summary: 'Create a buy-now order' })
  @ApiOkResponse({
    description: 'Created order.',
    schema: { type: 'object' },
  })
  async createForBuyNow(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateOrderForBuyNowDto,
  ) {
    try {
      return toCreateOrderResponse(
        await this.createOrderForBuyNowUseCase.execute(currentUser, body),
      );
    }
    catch (error) {
      this.throwMappedCheckoutError(error);
    }
  }

  @Get('session')
  @ApiOperation({ summary: 'Get orders by checkout session' })
  @ApiQuery({ name: 'session_id', required: false, type: String })
  @ApiOkResponse({
    description: 'Checkout session orders.',
    schema: { type: 'object' },
  })
  async getByCheckoutSession(@Query('session_id') sessionId?: string) {
    try {
      return toCheckoutSessionOrderResponse(
        await this.getOrdersByCheckoutSessionUseCase.execute(sessionId ?? ''),
      );
    }
    catch (error) {
      this.throwMappedCheckoutError(error);
    }
  }

  private throwMappedCheckoutError(error: unknown): never {
    if (isCheckoutAppError(error)) {
      throw mapCheckoutAppErrorToHttpException(error);
    }

    throw error;
  }
}
