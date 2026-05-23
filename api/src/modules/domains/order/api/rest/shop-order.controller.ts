import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards
} from '@nestjs/common';
import { RequirePermissions } from '~/common/decorators/require-permissions.decorator';
import { CurrentUser } from '~/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '~/modules/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/modules/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import { GetShopOrderByIdUseCase } from '../../app/use-cases/get-shop-order-by-id/get-shop-order-by-id.use-case';
import { ListShopOrdersUseCase } from '../../app/use-cases/list-shop-orders/list-shop-orders.use-case';
import { UpdateShopOrderShipmentUseCase } from '../../app/use-cases/update-shop-order-shipment/update-shop-order-shipment.use-case';
import { UpdateShopOrderStatusUseCase } from '../../app/use-cases/update-shop-order-status/update-shop-order-status.use-case';
import { ListShopOrdersQueryDto } from './dto/list-shop-orders.query.dto';
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

@Controller('shops/:shopId/orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
export class ShopOrderController {
  constructor(
    private readonly shopRepository: ShopRepository,
    private readonly listShopOrdersUseCase: ListShopOrdersUseCase,
    private readonly getShopOrderByIdUseCase: GetShopOrderByIdUseCase,
    private readonly updateShopOrderStatusUseCase: UpdateShopOrderStatusUseCase,
    private readonly updateShopOrderShipmentUseCase: UpdateShopOrderShipmentUseCase
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shopId') shopId: string,
    @Query() query: ListShopOrdersQueryDto
  ) {
    await this.assertActorCanManageShop(currentUser, shopId);

    return this.listShopOrdersUseCase.execute(shopId, query)
      .then(toShopOrderListResponse);
  }

  @Get(':orderId')
  @Header('Cache-Control', 'private, no-cache')
  async detail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shopId') shopId: string,
    @Param('orderId') orderId: string
  ) {
    await this.assertActorCanManageShop(currentUser, shopId);

    try {
      return toShopOrderDetailResponse(
        await this.getShopOrderByIdUseCase.execute(shopId, orderId)
      );
    }
    catch (error) {
      this.throwMappedOrderError(error);
    }
  }

  @Patch(':orderId/status')
  @Header('Cache-Control', 'private, no-store')
  async updateStatus(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shopId') shopId: string,
    @Param('orderId') orderId: string,
    @Body() body: UpdateShopOrderStatusDto
  ) {
    await this.assertActorCanManageShop(currentUser, shopId);

    try {
      return toShopOrderDetailResponse(
        await this.updateShopOrderStatusUseCase.execute(shopId, orderId, body)
      );
    }
    catch (error) {
      this.throwMappedOrderError(error);
    }
  }

  @Patch(':orderId/shipment')
  @Header('Cache-Control', 'private, no-store')
  async updateShipment(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shopId') shopId: string,
    @Param('orderId') orderId: string,
    @Body() body: UpdateShopOrderShipmentDto
  ) {
    await this.assertActorCanManageShop(currentUser, shopId);

    try {
      return toShopOrderDetailResponse(
        await this.updateShopOrderShipmentUseCase.execute(shopId, orderId, body)
      );
    }
    catch (error) {
      this.throwMappedOrderError(error);
    }
  }

  private async assertActorCanManageShop(
    currentUser: AuthenticatedUser,
    shopId: string
  ): Promise<void> {
    if (currentUser.roles.includes('admin')) {
      const shop = await this.shopRepository.findById(shopId);

      if (!shop) {
        throw new NotFoundException('Shop was not found');
      }

      return;
    }

    const shop = await this.shopRepository.findOwnedById(shopId, currentUser.userId);

    if (shop) {
      return;
    }

    const existingShop = await this.shopRepository.findById(shopId);

    if (!existingShop) {
      throw new NotFoundException('Shop was not found');
    }

    throw new ForbiddenException('You do not own this shop');
  }

  private throwMappedOrderError(error: unknown): never {
    if (isOrderAppError(error)) {
      throw mapOrderAppErrorToHttpException(error);
    }

    throw error;
  }
}
