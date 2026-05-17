import {
  Body, Controller, Get, Header, NotFoundException, Post, UseGuards 
} from '@nestjs/common';
import { RequirePermissions } from '~/common/decorators/require-permissions.decorator';
import { resolveOrThrow } from '~/common/application/result';
import { CurrentUser } from '~/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { JwtAuthGuard } from '~/modules/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/modules/domains/auth/api/guard/permissions.guard';
import { CreateShopUseCase } from '../../app/use-cases/create-shop/create-shop.use-case';
import { GetMyShopUseCase } from '../../app/use-cases/get-my-shop/get-my-shop.use-case';
import type { ShopSummary } from '../../app/shop.types';
import { CreateShopDto } from './dto/create-shop.dto';
import { mapShopAppErrorToHttpException } from './shop-http-error-mapper';

@Controller('shops')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ShopController {
  constructor(
    private readonly createShopUseCase: CreateShopUseCase,
    private readonly getMyShopUseCase: GetMyShopUseCase
  ) {}

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions('shops.create')
  createShop(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateShopDto
  ): Promise<ShopSummary> {
    return this.createShopUseCase.execute(currentUser, {
      shopName: body.shop_name,
    })
      .then((result) => resolveOrThrow(result, mapShopAppErrorToHttpException));
  }

  @Get('me')
  @Header('Cache-Control', 'private, no-cache')
  @RequirePermissions('shops.manage')
  async myShop(
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<ShopSummary> {
    const shop = await this.getMyShopUseCase.execute(currentUser);

    if (!shop) {
      throw new NotFoundException('Shop was not found');
    }

    return shop;
  }
}
