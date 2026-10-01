import {
  Body, Controller, Get, Header, NotFoundException, Param, Patch, Post, UseGuards, 
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
import { UpdateShopSettingsUseCase } from '../../app/use-cases/update-shop-settings/update-shop-settings.use-case';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopSettingsDto } from './dto/update-shop-settings.dto';
import {
  isShopAppError,
  mapShopAppErrorToHttpException,
} from './shop-http-error-mapper';
import { toShopResponse } from './shop.response';

@Controller('shops')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags('Shops')
@ApiCookieAuth('accessCookie')
export class ShopController {
  constructor(
    private readonly createShopUseCase: CreateShopUseCase,
    private readonly getMyShopUseCase: GetMyShopUseCase,
    private readonly updateShopSettingsUseCase: UpdateShopSettingsUseCase,
  ) {}

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions('shops.create')
  @ApiOperation({ summary: 'Create a shop' })
  @ApiOkResponse({
    description: 'Created shop.',
    schema: { type: 'object' },
  })
  createShop(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateShopDto,
  ) {
    return this.createShopUseCase.execute(currentUser, {
      shopName: body.shop_name,
      currency: body.currency,
    })
      .then((result) => resolveOrThrow(result, mapShopAppErrorToHttpException))
      .then(toShopResponse);
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
      throw new NotFoundException('Shop was not found');
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
    @Param('shop_id') shopId: string,
    @Body() body: UpdateShopSettingsDto,
  ) {
    try {
      const shop = await this.updateShopSettingsUseCase.execute(
        currentUser,
        shopId,
        { timezone: body.timezone },
      );

      return toShopResponse(shop);
    }
    catch (error) {
      this.throwMappedShopError(error);
    }
  }

  private throwMappedShopError(error: unknown): never {
    if (isShopAppError(error)) {
      throw mapShopAppErrorToHttpException(error);
    }

    throw error;
  }
}
