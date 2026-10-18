import {
  Controller,
  Get,
  Header,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '~/platform/decorators/current-user.decorator';
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ShopAccessService } from '~/domains/shop/app/services/shop-access.service';
import { GetShopSellerPayableUseCase } from '../../app/use-cases/get-shop-seller-payable/get-shop-seller-payable.use-case';
import { shopFinanceControllerErrorResponses } from './errors/finance-error-responses';
import {
  ShopSellerPayableResponseDto,
  toSellerPayableResponse,
} from './responses/seller-payable.response';

@Controller('shops/:shop_id/finance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
@ApiTags('Shop Finance')
@ApiCookieAuth('accessCookie')
@ApiErrorResponses(shopFinanceControllerErrorResponses.controller)
export class ShopFinanceController {
  constructor(
    private readonly shopAccessService: ShopAccessService,
    private readonly getShopSellerPayableUseCase: GetShopSellerPayableUseCase,
  ) {}

  @Get('payable')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get shop Seller Payable' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'The shop Seller Payable by currency.',
    type: ShopSellerPayableResponseDto,
  })
  @ApiErrorResponses(shopFinanceControllerErrorResponses.payable)
  async payable(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
  ) {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;

    return toSellerPayableResponse(
      await this.getShopSellerPayableUseCase.execute(shopId),
    );
  }
}
