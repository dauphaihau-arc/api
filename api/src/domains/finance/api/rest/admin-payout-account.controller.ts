import {
  Controller,
  Get,
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
import { GetShopPayoutAccountUseCase } from '../../app/use-cases/get-shop-payout-account/get-shop-payout-account.use-case';
import { adminPayoutAccountControllerErrorResponses } from './errors/finance-error-responses';
import { FinanceExceptionsFilter } from './errors/finance-exceptions.filter';
import {
  AdminShopPayoutAccountResponseDto,
  toAdminShopPayoutAccountResponse,
} from './responses/payout-account.response';

/**
 * The operator's read of a shop's Payout Account. Onboarding and verification
 * belong to Stripe, so there is no operator decision to record here.
 */
@Controller('admin/shops/:shop_id/finance/payout-account')
@UseFilters(FinanceExceptionsFilter)
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('finance.manage')
@ApiExcludeController()
@ApiTags('Admin Finance')
@ApiCookieAuth('accessCookie')
@ApiErrorResponses(adminPayoutAccountControllerErrorResponses.controller)
export class AdminPayoutAccountController {
  constructor(
    private readonly shopAccessService: ShopAccessService,
    private readonly getShopPayoutAccountUseCase: GetShopPayoutAccountUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get a shop Payout Account' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({ type: AdminShopPayoutAccountResponseDto })
  @ApiErrorResponses(adminPayoutAccountControllerErrorResponses.read)
  async read(
    @Param('shop_id') shopPublicId: string,
  ): Promise<AdminShopPayoutAccountResponseDto> {
    const shopId = await this.shopAccessService.resolveShopPublicId(shopPublicId);

    return toAdminShopPayoutAccountResponse(
      shopPublicId,
      await this.getShopPayoutAccountUseCase.execute({ shopId }),
    );
  }
}
