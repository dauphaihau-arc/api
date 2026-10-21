import {
  Controller,
  Get,
  Header,
  Param,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiExcludeController,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import { ShopAccessService } from '~/domains/shop/app/services/shop-access.service';
import { GetShopPayoutsUseCase } from '../../app/use-cases/get-shop-payouts/get-shop-payouts.use-case';
import { GetShopSellerPayableUseCase } from '../../app/use-cases/get-shop-seller-payable/get-shop-seller-payable.use-case';
import { adminShopFinanceControllerErrorResponses } from './errors/finance-error-responses';
import { FinanceExceptionsFilter } from './errors/finance-exceptions.filter';
import {
  ShopPayoutHistoryResponseDto,
  toShopPayoutHistoryResponse,
} from './responses/payout.response';
import {
  ShopSellerPayableResponseDto,
  toSellerPayableResponse,
} from './responses/seller-payable.response';

/**
 * The operator's read of a shop's money facts. A negative Seller Payable and a
 * Blocked Payout are visible here exactly as the shop sees them, plus the state
 * a Payout ended in.
 */
@Controller('admin/shops/:shop_id/finance')
@UseFilters(FinanceExceptionsFilter)
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('finance.manage')
@ApiExcludeController()
@ApiTags('Admin Finance')
@ApiCookieAuth('accessCookie')
@ApiErrorResponses(adminShopFinanceControllerErrorResponses.controller)
export class AdminShopFinanceController {
  constructor(
    private readonly shopAccessService: ShopAccessService,
    private readonly getShopSellerPayableUseCase: GetShopSellerPayableUseCase,
    private readonly getShopPayoutsUseCase: GetShopPayoutsUseCase,
  ) {}

  @Get('payable')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get a shop Seller Payable' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({ type: ShopSellerPayableResponseDto })
  @ApiErrorResponses(adminShopFinanceControllerErrorResponses.payable)
  async payable(
    @Param('shop_id') shopPublicId: string,
  ): Promise<ShopSellerPayableResponseDto> {
    const shopId = await this.shopAccessService.resolveShopPublicId(shopPublicId);

    return toSellerPayableResponse(
      await this.getShopSellerPayableUseCase.execute(shopId),
    );
  }

  @Get('payouts')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get a shop Payout history, including Blocked Payouts' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({ type: ShopPayoutHistoryResponseDto })
  @ApiErrorResponses(adminShopFinanceControllerErrorResponses.payouts)
  async payouts(
    @Param('shop_id') shopPublicId: string,
  ): Promise<ShopPayoutHistoryResponseDto> {
    const shopId = await this.shopAccessService.resolveShopPublicId(shopPublicId);

    return toShopPayoutHistoryResponse(
      await this.getShopPayoutsUseCase.execute({ shopId }),
    );
  }
}
