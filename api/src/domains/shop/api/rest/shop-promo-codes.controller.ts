import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
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
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { CurrentUser } from '~/platform/decorators/current-user.decorator';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import { ShopAccessService } from '../../app/services/shop-access.service';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { CreateShopPromoCodeUseCase } from '../../app/use-cases/create-shop-promo-code/create-shop-promo-code.use-case';
import { ListShopPromoCodesUseCase } from '../../app/use-cases/list-shop-promo-codes/list-shop-promo-codes.use-case';
import { BulkStopShopPromoCodesUseCase } from '../../app/use-cases/bulk-stop-shop-promo-codes/bulk-stop-shop-promo-codes.use-case';
import { ShopPromoCodeStopAction, StopShopPromoCodeUseCase } from '../../app/use-cases/stop-shop-promo-code/stop-shop-promo-code.use-case';
import { BulkStopShopPromoCodesDto } from './dto/bulk-stop-shop-promo-codes.dto';
import { CreateShopPromoCodeDto } from './dto/create-shop-promo-code.dto';
import { ListShopPromoCodesQueryDto } from './dto/list-shop-promo-codes.query.dto';
import { ShopExceptionsFilter } from './errors/shop-exceptions.filter';
import { shopPromoCodesControllerErrorResponses } from './errors/shop-error-responses';
import {
  toShopPromoCodeListResponse,
  toShopPromoCodeResponse,
  toShopPromoCodeStopListResponse,
} from './responses/shop-promo-code.response';

@Controller('shops/:shop_id/promo-codes')
@UseFilters(ShopExceptionsFilter)
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
@ApiTags('Shop Promo Codes')
@ApiCookieAuth('accessCookie')
@ApiErrorResponses(shopPromoCodesControllerErrorResponses.common)
export class ShopPromoCodesController {
  constructor(
    private readonly createShopPromoCodeUseCase: CreateShopPromoCodeUseCase,
    private readonly listShopPromoCodesUseCase: ListShopPromoCodesUseCase,
    private readonly stopShopPromoCodeUseCase: StopShopPromoCodeUseCase,
    private readonly bulkStopShopPromoCodesUseCase: BulkStopShopPromoCodesUseCase,
    private readonly shopAccessService: ShopAccessService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create promo code',
    description: 'Creates a percentage or fixed-amount promo code.',
  })
  @ApiErrorResponses(shopPromoCodesControllerErrorResponses.create)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'Created promo code.',
    schema: { type: 'object' },
  })
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Body() body: CreateShopPromoCodeDto,
  ) {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;
    const promoCode = await this.createShopPromoCodeUseCase.execute(currentUser, shopId, body);

    return { promo_code: toShopPromoCodeResponse(promoCode) };
  }

  @Get()
  @ApiOperation({ summary: 'List shop promo codes' })
  @ApiErrorResponses(shopPromoCodesControllerErrorResponses.list)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'Paginated promo code list.',
    schema: { type: 'object' },
  })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Query() query: ListShopPromoCodesQueryDto,
  ) {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;
    return toShopPromoCodeListResponse(
      await this.listShopPromoCodesUseCase.execute(currentUser, shopId, query),
    );
  }

  @Post(':promo_code_id/cancel')
  @ApiOperation({ summary: 'Cancel scheduled promo code' })
  @ApiErrorResponses(shopPromoCodesControllerErrorResponses.cancel)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'promo_code_id', type: String })
  @ApiOkResponse({
    description: 'Cancelled promo code.',
    schema: { type: 'object' },
  })
  async cancel(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('promo_code_id') promoCodePublicId: string,
  ) {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;
    const promoCode = await this.stopShopPromoCodeUseCase.execute(
      currentUser,
      shopId,
      promoCodePublicId,
      ShopPromoCodeStopAction.CANCEL,
    );

    return { promo_code: toShopPromoCodeResponse(promoCode) };
  }

  @Post(':promo_code_id/end')
  @ApiOperation({ summary: 'End active promo code' })
  @ApiErrorResponses(shopPromoCodesControllerErrorResponses.end)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'promo_code_id', type: String })
  @ApiOkResponse({
    description: 'Ended promo code.',
    schema: { type: 'object' },
  })
  async end(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('promo_code_id') promoCodePublicId: string,
  ) {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;
    const promoCode = await this.stopShopPromoCodeUseCase.execute(
      currentUser,
      shopId,
      promoCodePublicId,
      ShopPromoCodeStopAction.END,
    );

    return { promo_code: toShopPromoCodeResponse(promoCode) };
  }

  @Post('bulk-stop')
  @ApiOperation({
    summary: 'Stop promo codes',
    description: 'Cancels scheduled promo codes and ends active promo codes.',
  })
  @ApiErrorResponses(shopPromoCodesControllerErrorResponses.bulkStop)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'Per-promo-code stop outcome.',
    schema: { type: 'object' },
  })
  async bulkStop(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Body() body: BulkStopShopPromoCodesDto,
  ) {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;
    return toShopPromoCodeStopListResponse(
      await this.bulkStopShopPromoCodesUseCase.execute(currentUser, shopId, body.ids),
    );
  }
}