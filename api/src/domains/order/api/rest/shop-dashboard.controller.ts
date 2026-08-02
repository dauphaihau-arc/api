import {
  Controller,
  Get,
  Header,
  Param,
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
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ShopAccessService } from '~/domains/shop/app/services/shop-access.service';
import { CurrentUser } from '~/platform/decorators/current-user.decorator';
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { GetShopDashboardUseCase } from '../../app/use-cases/get-shop-dashboard/get-shop-dashboard.use-case';
import { GetShopDashboardQueryDto } from './dto/get-shop-dashboard.query.dto';
import { toShopDashboardResponse } from './order.response';

@Controller('shops/:shop_id/dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
@ApiTags('Shop Dashboard')
@ApiCookieAuth('accessCookie')
export class ShopDashboardController {
  constructor(
    private readonly shopAccessService: ShopAccessService,
    private readonly getShopDashboardUseCase: GetShopDashboardUseCase,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get shop dashboard overview' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'Shop dashboard overview.',
    schema: { type: 'object' },
  })
  async overview(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Query() query: GetShopDashboardQueryDto,
  ) {
    const shop = await this.shopAccessService.resolveManageableShop(currentUser, shopId);

    return this.getShopDashboardUseCase.execute({
      shopId: shop.id,
      currency: shop.currency,
      range: query.range,
    }).then(toShopDashboardResponse);
  }
}
