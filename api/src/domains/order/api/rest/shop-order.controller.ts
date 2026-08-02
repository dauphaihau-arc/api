import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { CurrentUser } from '~/platform/decorators/current-user.decorator';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ShopAccessService } from '~/domains/shop/app/services/shop-access.service';
import { GetShopOrderByIdUseCase } from '../../app/use-cases/get-shop-order-by-id/get-shop-order-by-id.use-case';
import { ListShopOrdersUseCase } from '../../app/use-cases/list-shop-orders/list-shop-orders.use-case';
import { UpdateShopOrderShipmentUseCase } from '../../app/use-cases/update-shop-order-shipment/update-shop-order-shipment.use-case';
import { UpdateShopOrderStatusUseCase } from '../../app/use-cases/update-shop-order-status/update-shop-order-status.use-case';
import { UpdateShopOrderRefundUseCase } from '../../app/use-cases/update-shop-order-refund/update-shop-order-refund.use-case';
import { ListShopOrdersQueryDto } from './dto/list-shop-orders.query.dto';
import { UpdateShopOrderRefundDto } from './dto/update-shop-order-refund.dto';
import { UpdateShopOrderShipmentDto } from './dto/update-shop-order-shipment.dto';
import { UpdateShopOrderStatusDto } from './dto/update-shop-order-status.dto';
import {
  toShopOrderDetailResponse,
  toShopOrderListResponse,
} from './order.response';
import {
  isOrderAppError,
  mapOrderAppErrorToHttpException,
} from './order-http-error-mapper';

@Controller('shops/:shop_id/orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
@ApiTags('Shop Orders')
@ApiCookieAuth('accessCookie')
export class ShopOrderController {
  constructor(
    private readonly shopAccessService: ShopAccessService,
    private readonly listShopOrdersUseCase: ListShopOrdersUseCase,
    private readonly getShopOrderByIdUseCase: GetShopOrderByIdUseCase,
    private readonly updateShopOrderStatusUseCase: UpdateShopOrderStatusUseCase,
    private readonly updateShopOrderShipmentUseCase: UpdateShopOrderShipmentUseCase,
    private readonly updateShopOrderRefundUseCase: UpdateShopOrderRefundUseCase,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'List shop orders' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'Paginated shop order list.',
    schema: { type: 'object' },
  })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Query() query: ListShopOrdersQueryDto,
  ) {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    return this.listShopOrdersUseCase.execute(shopId, query)
      .then(toShopOrderListResponse);
  }

  @Get(':order_id')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get shop order detail' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiOkResponse({
    description: 'Shop order detail.',
    schema: { type: 'object' },
  })
  async detail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Param('order_id') orderId: string,
  ) {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    try {
      return toShopOrderDetailResponse(
        await this.getShopOrderByIdUseCase.execute(shopId, orderId),
      );
    }
    catch (error) {
      this.throwMappedOrderError(error);
    }
  }

  @Patch(':order_id/status')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Update shop order status' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiOkResponse({
    description: 'Updated shop order detail.',
    schema: { type: 'object' },
  })
  async updateStatus(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Param('order_id') orderId: string,
    @Body() body: UpdateShopOrderStatusDto,
  ) {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    try {
      return toShopOrderDetailResponse(
        await this.updateShopOrderStatusUseCase.execute(shopId, orderId, body),
      );
    }
    catch (error) {
      this.throwMappedOrderError(error);
    }
  }

  @Patch(':order_id/shipment')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Update shop order shipment' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiOkResponse({
    description: 'Updated shop order detail.',
    schema: { type: 'object' },
  })
  async updateShipment(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Param('order_id') orderId: string,
    @Body() body: UpdateShopOrderShipmentDto,
  ) {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    try {
      return toShopOrderDetailResponse(
        await this.updateShopOrderShipmentUseCase.execute(shopId, orderId, body),
      );
    }
    catch (error) {
      this.throwMappedOrderError(error);
    }
  }

  @Patch(':order_id/refund')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Request or retry shop order refund' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'order_id', type: String })
  @ApiOkResponse({
    description: 'Updated shop order detail.',
    schema: { type: 'object' },
  })
  async updateRefund(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Param('order_id') orderId: string,
    @Body() body: UpdateShopOrderRefundDto,
  ) {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    try {
      return toShopOrderDetailResponse(
        await this.updateShopOrderRefundUseCase.execute(shopId, orderId, body),
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
