import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth, ApiExcludeController,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import { ListAdminOrdersUseCase } from '../../app/use-cases/list-admin-orders/list-admin-orders.use-case';
import { GetAdminOrderByIdUseCase } from '../../app/use-cases/get-admin-order-by-id/get-admin-order-by-id.use-case';
import { UpdateAdminOrderStatusUseCase } from '../../app/use-cases/update-admin-order-status/update-admin-order-status.use-case';
import { UpdateAdminOrderRefundUseCase } from '../../app/use-cases/update-admin-order-refund/update-admin-order-refund.use-case';
import { UpdateAdminOrderSupportNoteUseCase } from '../../app/use-cases/update-admin-order-support-note/update-admin-order-support-note.use-case';
import { ListAdminOrdersQueryDto } from './dto/list-admin-orders.query.dto';
import { UpdateAdminOrderRefundDto } from './dto/update-admin-order-refund.dto';
import { UpdateAdminOrderStatusDto } from './dto/update-admin-order-status.dto';
import { UpdateAdminOrderSupportNoteDto } from './dto/update-admin-order-support-note.dto';
import { OrderPublicIdLookup } from '../../app/services/order-public-id-lookup.service';
import { OrderExceptionsFilter } from './errors/order-exceptions.filter';
import { toAdminOrderDetailResponse, toAdminOrderListResponse } from './responses/order.response';

@Controller('admin/orders')
@UseFilters(OrderExceptionsFilter)
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('orders.manage')
@ApiExcludeController()
@ApiTags('Admin Orders')
@ApiCookieAuth('accessCookie')
export class AdminOrderController {
  constructor(
    private readonly listAdminOrdersUseCase: ListAdminOrdersUseCase,
    private readonly getAdminOrderByIdUseCase: GetAdminOrderByIdUseCase,
    private readonly updateAdminOrderStatusUseCase: UpdateAdminOrderStatusUseCase,
    private readonly updateAdminOrderRefundUseCase: UpdateAdminOrderRefundUseCase,
    private readonly updateAdminOrderSupportNoteUseCase: UpdateAdminOrderSupportNoteUseCase,
    private readonly orderPublicIdLookup: OrderPublicIdLookup,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'List admin orders' })
  @ApiOkResponse({
    description: 'Paginated admin order list.',
    schema: { type: 'object' },
  })
  async list(@Query() query: ListAdminOrdersQueryDto) {
    return toAdminOrderListResponse(
      await this.listAdminOrdersUseCase.execute(query),
    );
  }

  @Get(':order_id')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get admin order detail' })
  @ApiParam({ name: 'order_id', type: String })
  @ApiOkResponse({
    description: 'Admin order detail.',
    schema: { type: 'object' },
  })
  async detail(@Param('order_id') publicId: string) {
    const orderId = await this.orderPublicIdLookup.resolveOrderPublicId(publicId);
    return toAdminOrderDetailResponse(
      await this.getAdminOrderByIdUseCase.execute(orderId),
    );
  }

  @Patch(':order_id/status')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Update admin order status' })
  @ApiParam({ name: 'order_id', type: String })
  @ApiOkResponse({
    description: 'Updated admin order detail.',
    schema: { type: 'object' },
  })
  async updateStatus(
    @Param('order_id') publicId: string,
    @Body() body: UpdateAdminOrderStatusDto,
  ) {
    const orderId = await this.orderPublicIdLookup.resolveOrderPublicId(publicId);
    return toAdminOrderDetailResponse(
      await this.updateAdminOrderStatusUseCase.execute(orderId, body),
    );
  }

  @Patch(':order_id/refund')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Update admin order refund state' })
  @ApiParam({ name: 'order_id', type: String })
  @ApiOkResponse({
    description: 'Updated admin order detail.',
    schema: { type: 'object' },
  })
  async updateRefund(
    @Param('order_id') publicId: string,
    @Body() body: UpdateAdminOrderRefundDto,
  ) {
    const orderId = await this.orderPublicIdLookup.resolveOrderPublicId(publicId);
    return toAdminOrderDetailResponse(
      await this.updateAdminOrderRefundUseCase.execute(orderId, body),
    );
  }

  @Patch(':order_id/support-note')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Update admin order support note' })
  @ApiParam({ name: 'order_id', type: String })
  @ApiOkResponse({
    description: 'Updated admin order detail.',
    schema: { type: 'object' },
  })
  async updateSupportNote(
    @Param('order_id') publicId: string,
    @Body() body: UpdateAdminOrderSupportNoteDto,
  ) {
    const orderId = await this.orderPublicIdLookup.resolveOrderPublicId(publicId);
    return toAdminOrderDetailResponse(
      await this.updateAdminOrderSupportNoteUseCase.execute(orderId, body),
    );
  }
}
