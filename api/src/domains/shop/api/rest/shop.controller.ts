import {
  Body, Controller, Get, Header, NotFoundException, Param, Patch, Post, UseFilters, UseGuards, 
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { resolveOrThrow } from '~/platform/application/result';
import { CurrentUser } from '~/platform/decorators/current-user.decorator';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import { CreateShopUseCase } from '../../app/use-cases/create-shop/create-shop.use-case';
import { GetMyShopUseCase } from '../../app/use-cases/get-my-shop/get-my-shop.use-case';
import { ShopAccessService } from '../../app/services/shop-access.service';
import { UpdateShopSettingsUseCase } from '../../app/use-cases/update-shop-settings/update-shop-settings.use-case';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopSettingsDto } from './dto/update-shop-settings.dto';
import { mapShopAppErrorToHttpException } from './errors/shop-http-error-mapper';
import { ShopExceptionsFilter } from './errors/shop-exceptions.filter';
import { toShopResponse } from './responses/shop.response';

@Controller('shops')
@UseFilters(ShopExceptionsFilter)
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags('Shops')
@ApiCookieAuth('accessCookie')
export class ShopController {
  constructor(
    private readonly createShopUseCase: CreateShopUseCase,
    private readonly getMyShopUseCase: GetMyShopUseCase,
    private readonly updateShopSettingsUseCase: UpdateShopSettingsUseCase,
    private readonly shopAccessService: ShopAccessService,
  ) {}

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions('shops.create')
  @ApiOperation({ summary: 'Create a shop' })
  @ApiOkResponse({
    description: 'Created shop.',
    schema: { type: 'object' },
  })
  async createShop(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateShopDto,
  ) {
    const result = await this.createShopUseCase.execute(currentUser, {
      shopName: body.shop_name,
      currency: body.currency,
    });

    return toShopResponse(
      resolveOrThrow(result, mapShopAppErrorToHttpException),
    );
  }

  @Get('me')
  @Header('Cache-Control', 'private, no-cache')
  @RequirePermissions('shops.manage')
  @ApiOperation({ summary: 'Get the current user shop' })
  @ApiOkResponse({
    description: 'Current user shop.',
    schema: { type: 'object' },
  })
  @ApiNotFoundResponse({ description: 'Shop was not found.' })
  async myShop(
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const shop = await this.getMyShopUseCase.execute(currentUser);

    if (!shop) {
      throw new NotFoundException({
        code: 'SHOP_NOT_FOUND',
        message: 'Shop was not found',
      });
    }

    return toShopResponse(shop);
  }

  @Patch(':shop_id/settings')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions('shops.manage')
  @ApiOperation({ summary: 'Update the shop store settings' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'Updated shop.',
    schema: { type: 'object' },
  })
  @ApiNotFoundResponse({ description: 'Shop was not found.' })
  async updateSettings(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Body() body: UpdateShopSettingsDto,
  ) {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;
    const shop = await this.updateShopSettingsUseCase.execute(
      currentUser,
      shopId,
      { timezone: body.timezone },
    );

    return toShopResponse(shop);
  }
}
