import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseFilters,
  UseGuards,
  UseInterceptors,
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
import { Idempotent } from '~/platform/idempotency/idempotent.decorator';
import { IdempotencyKeyInterceptor } from '~/platform/idempotency/idempotency-key.interceptor';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ShopAccessService } from '~/domains/shop/app/services/shop-access.service';
import { GetPayoutSettingsUseCase } from '../../app/use-cases/get-payout-settings/get-payout-settings.use-case';
import { GetShopPayoutAccountUseCase } from '../../app/use-cases/get-shop-payout-account/get-shop-payout-account.use-case';
import { GetShopPayoutsUseCase } from '../../app/use-cases/get-shop-payouts/get-shop-payouts.use-case';
import { GetShopSellerPayableUseCase } from '../../app/use-cases/get-shop-seller-payable/get-shop-seller-payable.use-case';
import { RecordShopPayoutAccountUseCase } from '../../app/use-cases/record-shop-payout-account/record-shop-payout-account.use-case';
import { RequestManualPayoutUseCase } from '../../app/use-cases/request-manual-payout/request-manual-payout.use-case';
import { SetAutoPayoutEnabledUseCase } from '../../app/use-cases/set-auto-payout-enabled/set-auto-payout-enabled.use-case';
import { RecordPayoutAccountDto } from './dto/record-payout-account.dto';
import { RequestManualPayoutDto } from './dto/request-manual-payout.dto';
import { UpdatePayoutSettingsDto } from './dto/update-payout-settings.dto';
import { shopFinanceControllerErrorResponses } from './errors/finance-error-responses';
import { FinanceExceptionsFilter } from './errors/finance-exceptions.filter';
import {
  ShopPayoutAccountResponseDto,
  toShopPayoutAccountResponse,
} from './responses/payout-account.response';
import {
  ShopPayoutHistoryResponseDto,
  ShopPayoutResponseWrapperDto,
  toShopPayoutHistoryResponse,
  toShopPayoutResponse,
} from './responses/payout.response';
import {
  ShopPayoutSettingsResponseDto,
  toShopPayoutSettingsResponse,
} from './responses/payout-settings.response';
import {
  ShopSellerPayableResponseDto,
  toSellerPayableResponse,
} from './responses/seller-payable.response';

@Controller('shops/:shop_id/finance')
@UseFilters(FinanceExceptionsFilter)
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
@ApiTags('Shop Finance')
@ApiCookieAuth('accessCookie')
@ApiErrorResponses(shopFinanceControllerErrorResponses.controller)
export class ShopFinanceController {
  constructor(
    private readonly shopAccessService: ShopAccessService,
    private readonly getShopSellerPayableUseCase: GetShopSellerPayableUseCase,
    private readonly getShopPayoutAccountUseCase: GetShopPayoutAccountUseCase,
    private readonly getShopPayoutsUseCase: GetShopPayoutsUseCase,
    private readonly getPayoutSettingsUseCase: GetPayoutSettingsUseCase,
    private readonly setAutoPayoutEnabledUseCase: SetAutoPayoutEnabledUseCase,
    private readonly requestManualPayoutUseCase: RequestManualPayoutUseCase,
    private readonly recordShopPayoutAccountUseCase: RecordShopPayoutAccountUseCase,
  ) {}

  @Get('payable')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get shop Seller Payable' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'The shop Seller Payable in its Settlement Currency.',
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

  @Get('payouts')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get the shop Payout history' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'The shop Payouts, newest first.',
    type: ShopPayoutHistoryResponseDto,
  })
  @ApiErrorResponses(shopFinanceControllerErrorResponses.payouts)
  async payouts(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
  ): Promise<ShopPayoutHistoryResponseDto> {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;

    return toShopPayoutHistoryResponse(
      await this.getShopPayoutsUseCase.execute({ shopId }),
    );
  }

  @Get('payout-account')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get the shop Payout Account' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'The shop Payout Account, masked, or null when none is recorded.',
    type: ShopPayoutAccountResponseDto,
  })
  @ApiErrorResponses(shopFinanceControllerErrorResponses.payoutAccountRead)
  async payoutAccount(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
  ): Promise<ShopPayoutAccountResponseDto> {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;

    return toShopPayoutAccountResponse(
      await this.getShopPayoutAccountUseCase.execute({ shopId }),
    );
  }

  @Get('payout-settings')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get the shop payout settings' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description:
      'Whether automatic payouts are enabled, the platform auto payout day, ' +
      'and what is left of this month manual withdrawal allowance.',
    type: ShopPayoutSettingsResponseDto,
  })
  @ApiErrorResponses(shopFinanceControllerErrorResponses.payoutSettingsRead)
  async payoutSettings(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
  ): Promise<ShopPayoutSettingsResponseDto> {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;

    return toShopPayoutSettingsResponse(
      await this.getPayoutSettingsUseCase.execute({ shopId }),
    );
  }

  @Put('payout-settings')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Opt the shop in to or out of automatic payouts' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'The saved payout settings.',
    type: ShopPayoutSettingsResponseDto,
  })
  @ApiErrorResponses(shopFinanceControllerErrorResponses.payoutSettingsUpdate)
  async updatePayoutSettings(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Body() body: UpdatePayoutSettingsDto,
  ): Promise<ShopPayoutSettingsResponseDto> {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;

    await this.setAutoPayoutEnabledUseCase.execute({
      shopId,
      shopPublicId,
      autoPayoutEnabled: body.autoPayoutEnabled,
    });

    // Read back through the settings view so the response also carries the
    // remaining allowance the seller asked to see.
    return toShopPayoutSettingsResponse(
      await this.getPayoutSettingsUseCase.execute({ shopId }),
    );
  }

  @Post('payouts/manual')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'finance:manual-payout' })
  @ApiOperation({
    summary: 'Withdraw the shop available balance manually',
    description:
      'Pays out the whole net available balance, or the requested amount, ' +
      'through the shop Payout Account. Limited to once per platform month ' +
      'unless the platform allows unlimited manual withdrawals.',
  })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'The Payout created by the manual withdrawal.',
    type: ShopPayoutResponseWrapperDto,
  })
  @ApiErrorResponses(shopFinanceControllerErrorResponses.manualPayout)
  async requestManualPayout(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Body() body: RequestManualPayoutDto,
  ): Promise<ShopPayoutResponseWrapperDto> {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;

    return {
      payout: toShopPayoutResponse(
        await this.requestManualPayoutUseCase.execute({
          shopId,
          requestedByUserId: currentUser.userId,
          amountMinor: body.amountMinor,
        }),
      ),
    };
  }

  @Put('payout-account')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Record or replace the shop Payout Account' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'The recorded Payout Account, masked.',
    type: ShopPayoutAccountResponseDto,
  })
  @ApiErrorResponses(shopFinanceControllerErrorResponses.payoutAccountRecord)
  async recordPayoutAccount(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Body() body: RecordPayoutAccountDto,
  ): Promise<ShopPayoutAccountResponseDto> {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;

    return toShopPayoutAccountResponse(
      await this.recordShopPayoutAccountUseCase.execute({
        shopId,
        shopPublicId,
        type: body.type,
        holderName: body.holderName,
        bankName: body.bankName,
        country: body.country,
        accountReference: body.accountReference,
      }),
    );
  }
}
