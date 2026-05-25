import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Query,
  UseGuards
} from '@nestjs/common';
import { RequirePermissions } from '~/common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '~/modules/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/modules/domains/auth/api/guard/permissions.guard';
import { ListAdminOrdersUseCase } from '../../app/use-cases/list-admin-orders/list-admin-orders.use-case';
import { GetAdminOrderByIdUseCase } from '../../app/use-cases/get-admin-order-by-id/get-admin-order-by-id.use-case';
import { UpdateAdminOrderStatusUseCase } from '../../app/use-cases/update-admin-order-status/update-admin-order-status.use-case';
import { UpdateAdminOrderRefundUseCase } from '../../app/use-cases/update-admin-order-refund/update-admin-order-refund.use-case';
import { UpdateAdminOrderSupportNoteUseCase } from '../../app/use-cases/update-admin-order-support-note/update-admin-order-support-note.use-case';
import { ListAdminOrdersQueryDto } from './dto/list-admin-orders.query.dto';
import { UpdateAdminOrderRefundDto } from './dto/update-admin-order-refund.dto';
import { UpdateAdminOrderStatusDto } from './dto/update-admin-order-status.dto';
import { UpdateAdminOrderSupportNoteDto } from './dto/update-admin-order-support-note.dto';
import {
  isOrderAppError,
  mapOrderAppErrorToHttpException,
} from './order-http-error-mapper';
import { toAdminOrderDetailResponse, toAdminOrderListResponse } from './order.response';

@Controller('admin/orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('orders.manage')
export class AdminOrderController {
  constructor(
    private readonly listAdminOrdersUseCase: ListAdminOrdersUseCase,
    private readonly getAdminOrderByIdUseCase: GetAdminOrderByIdUseCase,
    private readonly updateAdminOrderStatusUseCase: UpdateAdminOrderStatusUseCase,
    private readonly updateAdminOrderRefundUseCase: UpdateAdminOrderRefundUseCase,
    private readonly updateAdminOrderSupportNoteUseCase: UpdateAdminOrderSupportNoteUseCase
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  async list(@Query() query: ListAdminOrdersQueryDto) {
    return this.listAdminOrdersUseCase.execute(query)
      .then(toAdminOrderListResponse);
  }

  @Get(':orderId')
  @Header('Cache-Control', 'private, no-cache')
  async detail(@Param('orderId') orderId: string) {
    try {
      return toAdminOrderDetailResponse(
        await this.getAdminOrderByIdUseCase.execute(orderId)
      );
    }
    catch (error) {
      this.throwMappedOrderError(error);
    }
  }

  @Patch(':orderId/status')
  @Header('Cache-Control', 'private, no-store')
  async updateStatus(
    @Param('orderId') orderId: string,
    @Body() body: UpdateAdminOrderStatusDto
  ) {
    try {
      return toAdminOrderDetailResponse(
        await this.updateAdminOrderStatusUseCase.execute(orderId, body)
      );
    }
    catch (error) {
      this.throwMappedOrderError(error);
    }
  }

  @Patch(':orderId/refund')
  @Header('Cache-Control', 'private, no-store')
  async updateRefund(
    @Param('orderId') orderId: string,
    @Body() body: UpdateAdminOrderRefundDto
  ) {
    try {
      return toAdminOrderDetailResponse(
        await this.updateAdminOrderRefundUseCase.execute(orderId, body)
      );
    }
    catch (error) {
      this.throwMappedOrderError(error);
    }
  }

  @Patch(':orderId/support-note')
  @Header('Cache-Control', 'private, no-store')
  async updateSupportNote(
    @Param('orderId') orderId: string,
    @Body() body: UpdateAdminOrderSupportNoteDto
  ) {
    try {
      return toAdminOrderDetailResponse(
        await this.updateAdminOrderSupportNoteUseCase.execute(orderId, body)
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
