import {
  Body,
  Controller,
  Get,
  Param,
  Put,
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
import { RecordShopPayoutAccountVerificationUseCase } from '../../app/use-cases/record-shop-payout-account-verification/record-shop-payout-account-verification.use-case';
import { RecordPayoutAccountVerificationDto } from './dto/record-payout-account-verification.dto';
import { adminPayoutAccountControllerErrorResponses } from './errors/finance-error-responses';
import { FinanceExceptionsFilter } from './errors/finance-exceptions.filter';
import {
  AdminShopPayoutAccountResponseDto,
  toAdminShopPayoutAccountResponse,
} from './responses/payout-account.response';

/**
 * The operator's read and verification of a shop's Payout Account. The seller
 * records their own destination; only an operator decides whether it is usable,
 * so verification is never self-served.
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
    private readonly recordShopPayoutAccountVerificationUseCase: RecordShopPayoutAccountVerificationUseCase,
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

  @Put('verification')
  @ApiOperation({ summary: 'Record a shop Payout Account verification decision' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({ type: AdminShopPayoutAccountResponseDto })
  @ApiErrorResponses(adminPayoutAccountControllerErrorResponses.verification)
  async verify(
    @Param('shop_id') shopPublicId: string,
    @Body() body: RecordPayoutAccountVerificationDto,
  ): Promise<AdminShopPayoutAccountResponseDto> {
    const shopId = await this.shopAccessService.resolveShopPublicId(shopPublicId);

    return toAdminShopPayoutAccountResponse(
      shopPublicId,
      await this.recordShopPayoutAccountVerificationUseCase.execute({
        shopId,
        shopPublicId,
        status: body.status,
      }),
    );
  }
}
