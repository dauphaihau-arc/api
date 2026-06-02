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
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
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
import { ListMyOrdersQueryDto } from './dto/list-my-orders.query.dto';
import {
  toCheckoutQuoteResponse,
  toCreateOrderResponse,
  toCheckoutSessionOrderResponse,
  toMyOrderDetailResponse,
  toOrderListResponse
} from './order.response';

@Controller('me/orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags('My Orders')
@ApiCookieAuth('accessCookie')
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
  @ApiOperation({ summary: 'List my orders' })
  @ApiOkResponse({
    description: 'Paginated order list.',
    schema: { type: 'object' },
  })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListMyOrdersQueryDto
  ) {
    return this.listOrdersUseCase.execute(currentUser, query)
      .then(toOrderListResponse);
  }

  @Get(':order_id')
  @ApiOperation({ summary: 'Get my order detail' })
  @ApiParam({ name: 'order_id', type: String })
  @ApiOkResponse({
    description: 'Order detail.',
    schema: { type: 'object' },
  })
  async detail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('order_id') orderId: string
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

  @Patch(':order_id/cancel-request')
  @ApiOperation({ summary: 'Request order cancellation' })
  @ApiParam({ name: 'order_id', type: String })
  @ApiOkResponse({
    description: 'Updated order detail.',
    schema: { type: 'object' },
  })
  async requestCancel(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('order_id') orderId: string,
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

  @Patch(':order_id/support-request')
  @ApiOperation({ summary: 'Request order support' })
  @ApiParam({ name: 'order_id', type: String })
  @ApiOkResponse({
    description: 'Updated order detail.',
    schema: { type: 'object' },
  })
  async requestSupport(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('order_id') orderId: string,
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
  @ApiOperation({ summary: 'Create a checkout quote from my cart' })
  @ApiOkResponse({
    description: 'Checkout quote.',
    schema: { type: 'object' },
  })
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
  @ApiOperation({ summary: 'Create a buy-now checkout quote' })
  @ApiOkResponse({
    description: 'Checkout quote.',
    schema: { type: 'object' },
  })
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
  @ApiOperation({ summary: 'Create an order from my cart' })
  @ApiOkResponse({
    description: 'Created order.',
    schema: { type: 'object' },
  })
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
  @ApiOperation({ summary: 'Create a buy-now order' })
  @ApiOkResponse({
    description: 'Created order.',
    schema: { type: 'object' },
  })
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
  @ApiOperation({ summary: 'Get orders by checkout session' })
  @ApiQuery({ name: 'session_id', required: false, type: String })
  @ApiOkResponse({
    description: 'Checkout session orders.',
    schema: { type: 'object' },
  })
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
