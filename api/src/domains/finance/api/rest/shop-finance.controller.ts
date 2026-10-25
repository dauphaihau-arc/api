import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
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
import {
  PAYOUT_CONNECT_COUNTRIES_CONFIG,
  type PayoutConnectCountriesConfig,
} from '~/platform/config/payout-country.config';
import { ChangeSettlementCurrencyUseCase } from '../../app/use-cases/change-settlement-currency/change-settlement-currency.use-case';
import { GetPayoutSettingsUseCase } from '../../app/use-cases/get-payout-settings/get-payout-settings.use-case';
import { GetSettlementCurrencyUseCase } from '../../app/use-cases/get-settlement-currency/get-settlement-currency.use-case';
import { GetShopPayoutAccountUseCase } from '../../app/use-cases/get-shop-payout-account/get-shop-payout-account.use-case';
import { GetShopPayoutsUseCase } from '../../app/use-cases/get-shop-payouts/get-shop-payouts.use-case';
import { GetShopSellerPayableUseCase } from '../../app/use-cases/get-shop-seller-payable/get-shop-seller-payable.use-case';
import { GetShopTransactionsUseCase } from '../../app/use-cases/get-shop-transactions/get-shop-transactions.use-case';
import { QuoteShopPayoutUseCase } from '../../app/use-cases/quote-shop-payout/quote-shop-payout.use-case';
import { RequestManualPayoutUseCase } from '../../app/use-cases/request-manual-payout/request-manual-payout.use-case';
import { SetAutoPayoutEnabledUseCase } from '../../app/use-cases/set-auto-payout-enabled/set-auto-payout-enabled.use-case';
import { StartPayoutOnboardingUseCase } from '../../app/use-cases/start-payout-onboarding/start-payout-onboarding.use-case';
import { ChangeSettlementCurrencyDto } from './dto/change-settlement-currency.dto';
import { ListShopTransactionsQueryDto } from './dto/list-shop-transactions.query.dto';
import { RequestManualPayoutDto } from './dto/request-manual-payout.dto';
import { ShopPayoutQuoteQueryDto } from './dto/shop-payout-quote.query.dto';
import { StartPayoutOnboardingDto } from './dto/start-payout-onboarding.dto';
import { UpdatePayoutSettingsDto } from './dto/update-payout-settings.dto';
import { shopFinanceControllerErrorResponses } from './errors/finance-error-responses';
import { FinanceExceptionsFilter } from './errors/finance-exceptions.filter';
import {
  PayoutAccountCountriesResponseDto,
  PayoutAccountOnboardingResponseDto,
  ShopPayoutAccountResponseDto,
  toPayoutAccountCountriesResponse,
  toPayoutAccountOnboardingResponse,
  toShopPayoutAccountResponse,
} from './responses/payout-account.response';
import {
  ShopPayoutHistoryResponseDto,
  ShopPayoutQuoteResponseDto,
  ShopPayoutResponseWrapperDto,
  toShopPayoutHistoryResponse,
  toShopPayoutQuoteResponse,
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
import {
  ShopSettlementCurrencyChangeResponseDto,
  ShopSettlementCurrencyResponseDto,
  toShopSettlementCurrencyChangeResponse,
  toShopSettlementCurrencyResponse,
} from './responses/settlement-currency.response';
import {
  ShopTransactionsResponseDto,
  toShopTransactionsResponse,
} from './responses/transactions.response';

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
    private readonly getShopTransactionsUseCase: GetShopTransactionsUseCase,
    private readonly getShopPayoutAccountUseCase: GetShopPayoutAccountUseCase,
    private readonly getShopPayoutsUseCase: GetShopPayoutsUseCase,
    private readonly getPayoutSettingsUseCase: GetPayoutSettingsUseCase,
    private readonly setAutoPayoutEnabledUseCase: SetAutoPayoutEnabledUseCase,
    private readonly requestManualPayoutUseCase: RequestManualPayoutUseCase,
    private readonly quoteShopPayoutUseCase: QuoteShopPayoutUseCase,
    private readonly startPayoutOnboardingUseCase: StartPayoutOnboardingUseCase,
    private readonly getSettlementCurrencyUseCase: GetSettlementCurrencyUseCase,
    private readonly changeSettlementCurrencyUseCase: ChangeSettlementCurrencyUseCase,
    @Inject(PAYOUT_CONNECT_COUNTRIES_CONFIG)
    private readonly payoutConnectCountriesConfig: PayoutConnectCountriesConfig,
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

  @Get('settlement-currency')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get the shop Settlement Currency' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description:
      'The currency the shop settles in, read from its dated history, and when ' +
      'it may change again.',
    type: ShopSettlementCurrencyResponseDto,
  })
  @ApiErrorResponses(shopFinanceControllerErrorResponses.settlementCurrencyRead)
  async settlementCurrency(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
  ): Promise<ShopSettlementCurrencyResponseDto> {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;

    return toShopSettlementCurrencyResponse(
      await this.getSettlementCurrencyUseCase.execute({ shopId }),
    );
  }

  @Post('settlement-currency')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'finance:settlement-currency' })
  @ApiOperation({
    summary: 'Change the shop Settlement Currency',
    description:
      'Moves the shop to another marketplace currency at a zero Seller Payable ' +
      'position with no pending Payout. Takes effect immediately, writes the ' +
      'dated history row with its Cutover Rate, and turns automatic payouts off ' +
      'until a Payout Account in the new currency is onboarded and active.',
  })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'The Settlement Currency the shop now settles in.',
    type: ShopSettlementCurrencyChangeResponseDto,
  })
  @ApiErrorResponses(shopFinanceControllerErrorResponses.settlementCurrencyChange)
  async changeSettlementCurrency(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Body() body: ChangeSettlementCurrencyDto,
  ): Promise<ShopSettlementCurrencyChangeResponseDto> {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;

    return toShopSettlementCurrencyChangeResponse(
      await this.changeSettlementCurrencyUseCase.execute({
        shopId,
        shopPublicId,
        currency: body.currency,
      }),
    );
  }

  @Get('transactions')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get the shop transaction timeline' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description:
      'Order income, Refunds, and Payouts as one signed timeline, newest first.',
    type: ShopTransactionsResponseDto,
  })
  @ApiErrorResponses(shopFinanceControllerErrorResponses.transactions)
  async transactions(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Query() query: ListShopTransactionsQueryDto,
  ): Promise<ShopTransactionsResponseDto> {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;

    return toShopTransactionsResponse(
      await this.getShopTransactionsUseCase.execute({
        shopId,
        page: query.page,
        limit: query.limit,
        type: query.type,
        status: query.status,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      }),
    );
  }

  @Get('payouts/quote')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({
    summary: 'Quote a payout into the shop Payout Account',
    description:
      'The fee, rate, and amount that would land in the current Payout ' +
      'Account for a given shop-currency amount. Nothing is persisted: the ' +
      'withdrawal re-quotes and freezes the rate it actually uses, so a preview ' +
      'and a claim can differ only if the rate moved between them.',
  })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'The server-computed payout quote.',
    type: ShopPayoutQuoteResponseDto,
  })
  @ApiErrorResponses(shopFinanceControllerErrorResponses.payoutQuote)
  async payoutQuote(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Query() query: ShopPayoutQuoteQueryDto,
  ): Promise<ShopPayoutQuoteResponseDto> {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;

    return toShopPayoutQuoteResponse(
      await this.quoteShopPayoutUseCase.execute({
        shopId,
        amountMinor: query.amountMinor,
      }),
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

  @Get('payout-account/countries')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({
    summary: 'List the countries where the shop can start payout onboarding',
    description:
      'Stripe’s cross-border payout region (the EEA, GB, CA, CH and US), ' +
      'optionally narrowed by configuration, sorted. The seller picker offers ' +
      'exactly these, so a country Stripe would refuse is never chosen.',
  })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'The ISO 3166-1 alpha-2 codes the provider can onboard.',
    type: PayoutAccountCountriesResponseDto,
  })
  @ApiErrorResponses(shopFinanceControllerErrorResponses.payoutAccountRead)
  async payoutAccountCountries(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
  ): Promise<PayoutAccountCountriesResponseDto> {
    await this.shopAccessService.resolveManageableShopByPublicId(
      currentUser,
      shopPublicId,
    );

    return toPayoutAccountCountriesResponse(
      this.payoutConnectCountriesConfig.countries,
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

  @Post('payout-account/onboarding')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'finance:payout-account-onboarding' })
  @ApiOperation({
    summary: 'Start or resume the shop payout onboarding',
    description:
      'For stripe_connect, creates or reuses the Express connected account and ' +
      'returns a Stripe-hosted onboarding URL. For manual_bank, activates the ' +
      'local destination and returns a null URL, which keeps local payouts ' +
      'working without Stripe.',
  })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'The onboarding URL and the Payout Account status.',
    type: PayoutAccountOnboardingResponseDto,
  })
  @ApiErrorResponses(shopFinanceControllerErrorResponses.payoutAccountOnboarding)
  async startPayoutOnboarding(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Body() body: StartPayoutOnboardingDto,
  ): Promise<PayoutAccountOnboardingResponseDto> {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;

    return toPayoutAccountOnboardingResponse(
      await this.startPayoutOnboardingUseCase.execute({
        shopId,
        shopPublicId,
        email: currentUser.email,
        country: body.country,
      }),
    );
  }
}
