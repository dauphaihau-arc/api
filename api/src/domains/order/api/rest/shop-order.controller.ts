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
import { OrderPublicIdLookup } from '../../app/services/order-public-id-lookup.service';
import { ListShopOrdersUseCase } from '../../app/use-cases/list-shop-orders/list-shop-orders.use-case';
import { GetShopOrderByIdUseCase } from '../../app/use-cases/get-shop-order-by-id/get-shop-order-by-id.use-case';
import { UpdateShopOrderStatusUseCase } from '../../app/use-cases/update-shop-order-status/update-shop-order-status.use-case';
import { UpdateShopOrderRefundUseCase } from '../../app/use-cases/update-shop-order-refund/update-shop-order-refund.use-case';
import { ListShopOrdersQueryDto } from './dto/list-shop-orders.query.dto';
import { UpdateShopOrderRefundDto } from './dto/update-shop-order-refund.dto';
import { UpdateShopOrderStatusDto } from './dto/update-shop-order-status.dto';
import {
  toShopOrderDetailResponse,
  toShopOrderListResponse,
} from './responses/order.response';
import { OrderExceptionsFilter } from './errors/order-exceptions.filter';

@Controller('shops/:shop_id/orders')
@UseFilters(OrderExceptionsFilter)
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
@ApiTags('Shop Orders')
@ApiCookieAuth('accessCookie')
export class ShopOrderController {
  constructor(
    private readonly shopAccessService: ShopAccessService,
    private readonly orderPublicIdLookup: OrderPublicIdLookup,
    private readonly listShopOrdersUseCase: ListShopOrdersUseCase,
    private readonly getShopOrderByIdUseCase: GetShopOrderByIdUseCase,
    private readonly updateShopOrderStatusUseCase: UpdateShopOrderStatusUseCase,
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
    @Param('shop_id') shopPublicId: string,
    @Query() query: ListShopOrdersQueryDto,
  ) {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;

    return toShopOrderListResponse(
      await this.listShopOrdersUseCase.execute(shopId, query),
    );
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
    @Param('shop_id') shopPublicId: string,
    @Param('order_id') orderPublicId: string,
  ) {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;
    const orderId = await this.orderPublicIdLookup.resolveOrderPublicId(orderPublicId);

    return toShopOrderDetailResponse(
      await this.getShopOrderByIdUseCase.execute(shopId, orderId),
    );
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
    @Param('shop_id') shopPublicId: string,
    @Param('order_id') orderPublicId: string,
    @Body() body: UpdateShopOrderStatusDto,
  ) {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;
    const orderId = await this.orderPublicIdLookup.resolveOrderPublicId(orderPublicId);

    return toShopOrderDetailResponse(
      await this.updateShopOrderStatusUseCase.execute(shopId, orderId, body),
    );
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
    @Param('shop_id') shopPublicId: string,
    @Param('order_id') orderPublicId: string,
    @Body() body: UpdateShopOrderRefundDto,
  ) {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;
    const orderId = await this.orderPublicIdLookup.resolveOrderPublicId(orderPublicId);

    return toShopOrderDetailResponse(
      await this.updateShopOrderRefundUseCase.execute(shopId, orderId, body),
    );
  }
}
