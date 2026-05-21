import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common';
import { CurrentUser } from '~/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '~/modules/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/modules/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { CreateOrderForBuyNowUseCase } from '../../app/use-cases/create-order-for-buy-now/create-order-for-buy-now.use-case';
import { CreateOrderFromCartUseCase } from '../../app/use-cases/create-order-from-cart/create-order-from-cart.use-case';
import { GetOrdersByCheckoutSessionUseCase } from '../../app/use-cases/get-orders-by-checkout-session/get-orders-by-checkout-session.use-case';
import { ListOrdersUseCase } from '../../app/use-cases/list-orders/list-orders.use-case';
import { CreateOrderForBuyNowDto } from './dto/create-order-for-buy-now.dto';
import { CreateOrderFromCartDto } from './dto/create-order-from-cart.dto';
import {
  toCreateOrderResponse,
  toCheckoutSessionOrderResponse,
  toOrderListResponse
} from './order.response';

@Controller('me/orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MeOrderController {
  constructor(
    private readonly listOrdersUseCase: ListOrdersUseCase,
    private readonly createOrderFromCartUseCase: CreateOrderFromCartUseCase,
    private readonly createOrderForBuyNowUseCase: CreateOrderForBuyNowUseCase,
    private readonly getOrdersByCheckoutSessionUseCase: GetOrdersByCheckoutSessionUseCase
  ) {}

  @Get()
  async list(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.listOrdersUseCase.execute(currentUser)
      .then(toOrderListResponse);
  }

  @Post()
  async createFromCart(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateOrderFromCartDto
  ) {
    return this.createOrderFromCartUseCase.execute(currentUser, body)
      .then(toCreateOrderResponse);
  }

  @Put()
  async createForBuyNow(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateOrderForBuyNowDto
  ) {
    return this.createOrderForBuyNowUseCase.execute(currentUser, body)
      .then(toCreateOrderResponse);
  }

  @Delete()
  async getByCheckoutSession(@Query('session_id') sessionId?: string) {
    return this.getOrdersByCheckoutSessionUseCase.execute(sessionId ?? '')
      .then(toCheckoutSessionOrderResponse);
  }
}
