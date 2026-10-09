import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '~/platform/decorators/current-user.decorator';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { OrderPublicIdLookup } from '../../app/services/order-public-id-lookup.service';
import { GetMyOrderByIdUseCase } from '../../app/use-cases/get-my-order-by-id/get-my-order-by-id.use-case';
import { ListOrdersUseCase } from '../../app/use-cases/list-orders/list-orders.use-case';
import { RequestOrderCancelUseCase } from '../../app/use-cases/request-order-cancel/request-order-cancel.use-case';
import { RequestOrderSupportUseCase } from '../../app/use-cases/request-order-support/request-order-support.use-case';
import { RequestOrderCancelDto } from './dto/request-order-cancel.dto';
import { RequestOrderSupportDto } from './dto/request-order-support.dto';
import { ListMyOrdersQueryDto } from './dto/list-my-orders.query.dto';
import {
  toMyOrderDetailResponse,
  toOrderListResponse,
} from './responses/order.response';
import { OrderExceptionsFilter } from './errors/order-exceptions.filter';

@Controller('me/orders')
@UseFilters(OrderExceptionsFilter)
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags('My Orders')
@ApiCookieAuth('accessCookie')
export class MeOrderController {
  constructor(
    private readonly listOrdersUseCase: ListOrdersUseCase,
    private readonly getMyOrderByIdUseCase: GetMyOrderByIdUseCase,
    private readonly requestOrderCancelUseCase: RequestOrderCancelUseCase,
    private readonly requestOrderSupportUseCase: RequestOrderSupportUseCase,
    private readonly orderPublicIdLookup: OrderPublicIdLookup,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List my orders' })
  @ApiOkResponse({
    description: 'Paginated order list.',
    schema: { type: 'object' },
  })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListMyOrdersQueryDto,
  ) {
    return toOrderListResponse(
      await this.listOrdersUseCase.execute(currentUser, query),
    );
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
    @Param('order_id') publicId: string,
  ) {
    const orderId = await this.orderPublicIdLookup.resolveOrderPublicId(publicId);
    return toMyOrderDetailResponse(
      await this.getMyOrderByIdUseCase.execute(currentUser, orderId),
    );
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
    @Param('order_id') publicId: string,
    @Body() body: RequestOrderCancelDto,
  ) {
    const orderId = await this.orderPublicIdLookup.resolveOrderPublicId(publicId);
    return toMyOrderDetailResponse(
      await this.requestOrderCancelUseCase.execute(currentUser, orderId, body),
    );
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
    @Param('order_id') publicId: string,
    @Body() body: RequestOrderSupportDto,
  ) {
    const orderId = await this.orderPublicIdLookup.resolveOrderPublicId(publicId);
    return toMyOrderDetailResponse(
      await this.requestOrderSupportUseCase.execute(currentUser, orderId, body),
    );
  }
}
