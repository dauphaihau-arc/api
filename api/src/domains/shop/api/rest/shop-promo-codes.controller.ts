import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
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
import { CurrentUser } from '~/platform/decorators/current-user.decorator';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { CreateShopPromoCodeUseCase } from '../../app/use-cases/create-shop-promo-code/create-shop-promo-code.use-case';
import { ListShopPromoCodesUseCase } from '../../app/use-cases/list-shop-promo-codes/list-shop-promo-codes.use-case';
import { BulkStopShopPromoCodesUseCase } from '../../app/use-cases/bulk-stop-shop-promo-codes/bulk-stop-shop-promo-codes.use-case';
import { ShopPromoCodeStopAction, StopShopPromoCodeUseCase } from '../../app/use-cases/stop-shop-promo-code/stop-shop-promo-code.use-case';
import { BulkStopShopPromoCodesDto } from './dto/bulk-stop-shop-promo-codes.dto';
import { CreateShopPromoCodeDto } from './dto/create-shop-promo-code.dto';
import { ListShopPromoCodesQueryDto } from './dto/list-shop-promo-codes.query.dto';
import {
  isShopAppError,
  mapShopAppErrorToHttpException,
} from './shop-http-error-mapper';
import {
  toShopPromoCodeListResponse,
  toShopPromoCodeResponse,
  toShopPromoCodeStopListResponse,
} from './shop-promo-code.response';

@Controller('shops/:shop_id/promo-codes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
@ApiTags('Shop Promo Codes')
@ApiCookieAuth('accessCookie')
export class ShopPromoCodesController {
  constructor(
    private readonly createShopPromoCodeUseCase: CreateShopPromoCodeUseCase,
    private readonly listShopPromoCodesUseCase: ListShopPromoCodesUseCase,
    private readonly stopShopPromoCodeUseCase: StopShopPromoCodeUseCase,
    private readonly bulkStopShopPromoCodesUseCase: BulkStopShopPromoCodesUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a percentage or fixed-amount promo code' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'Created promo code.',
    schema: { type: 'object' },
  })
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Body() body: CreateShopPromoCodeDto,
  ) {
    try {
      const promoCode = await this.createShopPromoCodeUseCase.execute(
        currentUser,
        shopId,
        body,
      );

      return { promo_code: toShopPromoCodeResponse(promoCode) };
    }
    catch (error) {
      this.throwMappedShopError(error);
    }
  }

  @Get()
  @ApiOperation({ summary: 'List shop promo codes' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'Paginated promo code list.',
    schema: { type: 'object' },
  })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Query() query: ListShopPromoCodesQueryDto,
  ) {
    try {
      return toShopPromoCodeListResponse(
        await this.listShopPromoCodesUseCase.execute(currentUser, shopId, query),
      );
    }
    catch (error) {
      this.throwMappedShopError(error);
    }
  }

  @Post(':promo_code_id/cancel')
  @ApiOperation({ summary: 'Irreversibly cancel a scheduled promo code' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'promo_code_id', type: String })
  @ApiOkResponse({
    description: 'Cancelled promo code.',
    schema: { type: 'object' },
  })
  async cancel(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Param('promo_code_id') promoCodeId: string,
  ) {
    try {
      const promoCode = await this.stopShopPromoCodeUseCase.execute(
        currentUser,
        shopId,
        promoCodeId,
        ShopPromoCodeStopAction.CANCEL,
      );

      return { promo_code: toShopPromoCodeResponse(promoCode) };
    }
    catch (error) {
      this.throwMappedShopError(error);
    }
  }

  @Post(':promo_code_id/end')
  @ApiOperation({ summary: 'Irreversibly end an active promo code early' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'promo_code_id', type: String })
  @ApiOkResponse({
    description: 'Ended promo code.',
    schema: { type: 'object' },
  })
  async end(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Param('promo_code_id') promoCodeId: string,
  ) {
    try {
      const promoCode = await this.stopShopPromoCodeUseCase.execute(
        currentUser,
        shopId,
        promoCodeId,
        ShopPromoCodeStopAction.END,
      );

      return { promo_code: toShopPromoCodeResponse(promoCode) };
    }
    catch (error) {
      this.throwMappedShopError(error);
    }
  }

  @Post('bulk-stop')
  @ApiOperation({
    summary: 'Cancel scheduled promo codes and end active promo codes in one request',
  })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'Per-promo-code stop outcome.',
    schema: { type: 'object' },
  })
  async bulkStop(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Body() body: BulkStopShopPromoCodesDto,
  ) {
    try {
      return toShopPromoCodeStopListResponse(
        await this.bulkStopShopPromoCodesUseCase.execute(currentUser, shopId, body.ids),
      );
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