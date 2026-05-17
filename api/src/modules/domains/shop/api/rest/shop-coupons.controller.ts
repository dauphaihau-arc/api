import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { RequirePermissions } from '~/common/decorators/require-permissions.decorator';
import { CurrentUser } from '~/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '~/modules/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/modules/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { CreateShopCouponUseCase } from '../../app/use-cases/create-shop-coupon/create-shop-coupon.use-case';
import { DeleteShopCouponUseCase } from '../../app/use-cases/delete-shop-coupon/delete-shop-coupon.use-case';
import { ListShopCouponsUseCase } from '../../app/use-cases/list-shop-coupons/list-shop-coupons.use-case';
import { CreateShopCouponDto } from './dto/create-shop-coupon.dto';
import { ListShopCouponsQueryDto } from './dto/list-shop-coupons.query.dto';
import {
  toShopCouponListResponse,
  toShopCouponResponse
} from './shop-coupon.response';

@Controller('shops/:shopId/coupons')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
export class ShopCouponsController {
  constructor(
    private readonly createShopCouponUseCase: CreateShopCouponUseCase,
    private readonly listShopCouponsUseCase: ListShopCouponsUseCase,
    private readonly deleteShopCouponUseCase: DeleteShopCouponUseCase
  ) {}

  @Post()
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shopId') shopId: string,
    @Body() body: CreateShopCouponDto
  ) {
    const coupon = await this.createShopCouponUseCase.execute(
      currentUser,
      shopId,
      body
    );

    return { coupon: toShopCouponResponse(coupon) };
  }

  @Get()
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shopId') shopId: string,
    @Query() query: ListShopCouponsQueryDto
  ) {
    return this.listShopCouponsUseCase.execute(currentUser, shopId, query)
      .then(toShopCouponListResponse);
  }

  @Delete(':couponId')
  async remove(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shopId') shopId: string,
    @Param('couponId') couponId: string
  ) {
    await this.deleteShopCouponUseCase.execute(currentUser, shopId, couponId);
    return { message: 'deleted successfully' };
  }
}
