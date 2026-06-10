import {
  Body, Controller, Get, Header, NotFoundException, Post, UseGuards 
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from '@nestjs/swagger';
import { RequirePermissions } from '~/common/decorators/require-permissions.decorator';
import { resolveOrThrow } from '~/common/application/result';
import { CurrentUser } from '~/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { JwtAuthGuard } from '~/modules/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/modules/domains/auth/api/guard/permissions.guard';
import { CreateShopUseCase } from '../../app/use-cases/create-shop/create-shop.use-case';
import { GetMyShopUseCase } from '../../app/use-cases/get-my-shop/get-my-shop.use-case';
import { CreateShopDto } from './dto/create-shop.dto';
import { mapShopAppErrorToHttpException } from './shop-http-error-mapper';
import { toShopResponse } from './shop.response';

@Controller('shops')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags('Shops')
@ApiCookieAuth('accessCookie')
export class ShopController {
  constructor(
    private readonly createShopUseCase: CreateShopUseCase,
    private readonly getMyShopUseCase: GetMyShopUseCase
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
    @Body() body: CreateShopDto
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
    @CurrentUser() currentUser: AuthenticatedUser
  ) {
    const shop = await this.getMyShopUseCase.execute(currentUser);

    if (!shop) {
      throw new NotFoundException('Shop was not found');
    }

    return toShopResponse(shop);
  }
}
