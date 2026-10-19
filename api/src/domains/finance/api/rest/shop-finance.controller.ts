import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Put,
  UseFilters,
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
import { GetShopPayoutAccountUseCase } from '../../app/use-cases/get-shop-payout-account/get-shop-payout-account.use-case';
import { GetShopSellerPayableUseCase } from '../../app/use-cases/get-shop-seller-payable/get-shop-seller-payable.use-case';
import { RecordShopPayoutAccountUseCase } from '../../app/use-cases/record-shop-payout-account/record-shop-payout-account.use-case';
import { RecordPayoutAccountDto } from './dto/record-payout-account.dto';
import { shopFinanceControllerErrorResponses } from './errors/finance-error-responses';
import { FinanceExceptionsFilter } from './errors/finance-exceptions.filter';
import {
  ShopPayoutAccountResponseDto,
  toShopPayoutAccountResponse,
} from './responses/payout-account.response';
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
