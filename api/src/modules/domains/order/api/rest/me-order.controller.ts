import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common';
import { CurrentUser } from '~/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '~/modules/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/modules/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import {
  isOrderAppError,
  mapOrderAppErrorToHttpException,
} from './order-http-error-mapper';
import { CreateCheckoutQuoteForBuyNowUseCase } from '../../app/use-cases/create-checkout-quote-for-buy-now/create-checkout-quote-for-buy-now.use-case';
import { CreateOrderForBuyNowUseCase } from '../../app/use-cases/create-order-for-buy-now/create-order-for-buy-now.use-case';
import { CreateCheckoutQuoteFromCartUseCase } from '../../app/use-cases/create-checkout-quote-from-cart/create-checkout-quote-from-cart.use-case';
import { CreateOrderFromCartUseCase } from '../../app/use-cases/create-order-from-cart/create-order-from-cart.use-case';
import { GetMyOrderByIdUseCase } from '../../app/use-cases/get-my-order-by-id/get-my-order-by-id.use-case';
import { GetOrdersByCheckoutSessionUseCase } from '../../app/use-cases/get-orders-by-checkout-session/get-orders-by-checkout-session.use-case';
import { ListOrdersUseCase } from '../../app/use-cases/list-orders/list-orders.use-case';
import { RequestOrderCancelUseCase } from '../../app/use-cases/request-order-cancel/request-order-cancel.use-case';
import { RequestOrderSupportUseCase } from '../../app/use-cases/request-order-support/request-order-support.use-case';
import { CreateCheckoutQuoteForBuyNowDto } from './dto/create-checkout-quote-for-buy-now.dto';
import { CreateCheckoutQuoteFromCartDto } from './dto/create-checkout-quote-from-cart.dto';
import { CreateOrderForBuyNowDto } from './dto/create-order-for-buy-now.dto';
import { CreateOrderFromCartDto } from './dto/create-order-from-cart.dto';
import { RequestOrderCancelDto } from './dto/request-order-cancel.dto';
import { RequestOrderSupportDto } from './dto/request-order-support.dto';
import {
  toCheckoutQuoteResponse,
  toCreateOrderResponse,
  toCheckoutSessionOrderResponse,
  toMyOrderDetailResponse,
  toOrderListResponse
} from './order.response';

@Controller('me/orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MeOrderController {
  constructor(
    private readonly listOrdersUseCase: ListOrdersUseCase,
    private readonly createCheckoutQuoteFromCartUseCase: CreateCheckoutQuoteFromCartUseCase,
    private readonly createCheckoutQuoteForBuyNowUseCase: CreateCheckoutQuoteForBuyNowUseCase,
    private readonly createOrderFromCartUseCase: CreateOrderFromCartUseCase,
    private readonly createOrderForBuyNowUseCase: CreateOrderForBuyNowUseCase,
    private readonly getMyOrderByIdUseCase: GetMyOrderByIdUseCase,
    private readonly requestOrderCancelUseCase: RequestOrderCancelUseCase,
    private readonly requestOrderSupportUseCase: RequestOrderSupportUseCase,
    private readonly getOrdersByCheckoutSessionUseCase: GetOrdersByCheckoutSessionUseCase
  ) {}

  @Get()
  async list(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.listOrdersUseCase.execute(currentUser)
      .then(toOrderListResponse);
  }

  @Get(':orderId')
  async detail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('orderId') orderId: string
  ) {
    try {
      return toMyOrderDetailResponse(
        await this.getMyOrderByIdUseCase.execute(currentUser, orderId)
      );
    }
    catch (error) {
      this.throwMappedOrderError(error);
    }
  }

  @Patch(':orderId/cancel-request')
  async requestCancel(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() body: RequestOrderCancelDto
  ) {
    try {
      return toMyOrderDetailResponse(
        await this.requestOrderCancelUseCase.execute(currentUser, orderId, body)
      );
    }
    catch (error) {
      this.throwMappedOrderError(error);
    }
  }

  @Patch(':orderId/support-request')
  async requestSupport(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() body: RequestOrderSupportDto
  ) {
    try {
      return toMyOrderDetailResponse(
        await this.requestOrderSupportUseCase.execute(currentUser, orderId, body)
      );
    }
    catch (error) {
      this.throwMappedOrderError(error);
    }
  }

  @Post('quote')
  async createQuoteFromCart(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateCheckoutQuoteFromCartDto
  ) {
    try {
      return toCheckoutQuoteResponse(
        await this.createCheckoutQuoteFromCartUseCase.execute(currentUser, body)
      );
    }
    catch (error) {
      this.throwMappedOrderError(error);
    }
  }

  @Post('buy-now/quote')
  async createQuoteForBuyNow(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateCheckoutQuoteForBuyNowDto
  ) {
    try {
      return toCheckoutQuoteResponse(
        await this.createCheckoutQuoteForBuyNowUseCase.execute(currentUser, body)
      );
    }
    catch (error) {
      this.throwMappedOrderError(error);
    }
  }

  @Post()
  async createFromCart(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateOrderFromCartDto
  ) {
    try {
      return toCreateOrderResponse(
        await this.createOrderFromCartUseCase.execute(currentUser, body)
      );
    }
    catch (error) {
      this.throwMappedOrderError(error);
    }
  }

  @Put()
  async createForBuyNow(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateOrderForBuyNowDto
  ) {
    try {
      return toCreateOrderResponse(
        await this.createOrderForBuyNowUseCase.execute(currentUser, body)
      );
    }
    catch (error) {
      this.throwMappedOrderError(error);
    }
  }

  @Delete()
  async getByCheckoutSession(@Query('session_id') sessionId?: string) {
    try {
      return toCheckoutSessionOrderResponse(
        await this.getOrdersByCheckoutSessionUseCase.execute(sessionId ?? '')
      );
    }
    catch (error) {
      this.throwMappedOrderError(error);
    }
  }

  private throwMappedOrderError(error: unknown): never {
    if (isOrderAppError(error)) {
      throw mapOrderAppErrorToHttpException(error);
    }

    throw error;
  }
}
