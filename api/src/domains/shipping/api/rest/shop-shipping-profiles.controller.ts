import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '~/platform/decorators/current-user.decorator';
import { Idempotent } from '~/platform/idempotency/idempotent.decorator';
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { IdempotencyKeyInterceptor } from '~/platform/idempotency/idempotency-key.interceptor';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ShopAccessService } from '~/domains/shop/app/services/shop-access.service';
import { ArchiveShippingProfileUseCase } from '../../app/use-cases/archive-shipping-profile/archive-shipping-profile.use-case';
import { ClearDefaultShippingProfileUseCase } from '../../app/use-cases/clear-default-shipping-profile/clear-default-shipping-profile.use-case';
import { CreateShippingProfileUseCase } from '../../app/use-cases/create-shipping-profile/create-shipping-profile.use-case';
import { GetShippingProfileUseCase } from '../../app/use-cases/get-shipping-profile/get-shipping-profile.use-case';
import { ListShippingProfilesUseCase } from '../../app/use-cases/list-shipping-profiles/list-shipping-profiles.use-case';
import { PreviewShippingProfileUseCase } from '../../app/use-cases/preview-shipping-profile/preview-shipping-profile.use-case';
import { SetDefaultShippingProfileUseCase } from '../../app/use-cases/set-default-shipping-profile/set-default-shipping-profile.use-case';
import { UpdateShippingProfileUseCase } from '../../app/use-cases/update-shipping-profile/update-shipping-profile.use-case';
import { CreateShippingProfileDto } from './dto/create-shipping-profile.dto';
import { ListShippingProfilesQueryDto } from './dto/list-shipping-profiles.query.dto';
import { PreviewShippingProfileDto } from './dto/preview-shipping-profile.dto';
import { UpdateShippingProfileDto } from './dto/update-shipping-profile.dto';
import { mapShippingAppErrorToHttpException } from './errors/shipping-http-error-mapper';
import {
  toShippingProfileListResponse,
  toShippingProfileResponse,
  toShippingRatePreviewResponse,
} from './presenters/shipping-profile.presenter';
import type {
  ShippingProfileListResponse,
  ShippingProfileResponse,
  ShippingRatePreviewResponse,
} from './responses/shipping-profile.response';

@Controller('shops/:shop_id/shipping-profiles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
@ApiTags('Shop Shipping Profiles')
@ApiCookieAuth('accessCookie')
export class ShopShippingProfilesController {
  constructor(
    private readonly shopAccessService: ShopAccessService,
    private readonly archiveShippingProfileUseCase: ArchiveShippingProfileUseCase,
    private readonly clearDefaultShippingProfileUseCase: ClearDefaultShippingProfileUseCase,
    private readonly createShippingProfileUseCase: CreateShippingProfileUseCase,
    private readonly getShippingProfileUseCase: GetShippingProfileUseCase,
    private readonly listShippingProfilesUseCase: ListShippingProfilesUseCase,
    private readonly previewShippingProfileUseCase: PreviewShippingProfileUseCase,
    private readonly setDefaultShippingProfileUseCase: SetDefaultShippingProfileUseCase,
    private readonly updateShippingProfileUseCase: UpdateShippingProfileUseCase,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'List reusable shipping profiles for a shop' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({ description: 'Shop shipping profiles.', schema: { type: 'object' } })
  async profiles(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Query() query: ListShippingProfilesQueryDto,
  ): Promise<ShippingProfileListResponse> {
    const { id: shopId } = await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId);

    const result = await this.listShippingProfilesUseCase.execute(shopId, {
      page: query.page,
      limit: query.limit,
      statuses: query.status,
    });

    if (!result.isOk) {
      throw mapShippingAppErrorToHttpException(result.error);
    }

    return toShippingProfileListResponse(result.value);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'shipping-profile:create' })
  @ApiOperation({ summary: 'Create a reusable shipping profile' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiCreatedResponse({ description: 'Created shipping profile.', schema: { type: 'object' } })
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Body() body: CreateShippingProfileDto,
  ): Promise<ShippingProfileResponse> {
    const { id: shopId } = await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId);

    const result = await this.createShippingProfileUseCase.execute(shopId, {
      name: body.name,
      status: body.status,
      shipFromCountry: body.shipFromCountry,
      shipFromPostal: body.shipFromPostal,
      processingTimeMinDays: body.processingTimeMinDays,
      processingTimeMaxDays: body.processingTimeMaxDays,
      rates: body.rates,
    });

    if (!result.isOk) {
      throw mapShippingAppErrorToHttpException(result.error);
    }

    return toShippingProfileResponse(result.value);
  }

  @Get(':shipping_profile_id')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Read one shipping profile' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'shipping_profile_id', type: String })
  @ApiOkResponse({ description: 'Shipping profile.', schema: { type: 'object' } })
  async profile(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('shipping_profile_id') shippingProfileId: string,
  ): Promise<ShippingProfileResponse> {
    const { id: shopId } = await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId);

    const result = await this.getShippingProfileUseCase.execute(shopId, shippingProfileId);

    if (!result.isOk) {
      throw mapShippingAppErrorToHttpException(result.error);
    }

    return toShippingProfileResponse(result.value);
  }

  @Patch(':shipping_profile_id')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'shipping-profile:update' })
  @ApiOperation({ summary: 'Edit a shipping profile and its destination rates' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'shipping_profile_id', type: String })
  @ApiOkResponse({ description: 'Updated shipping profile.', schema: { type: 'object' } })
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('shipping_profile_id') shippingProfileId: string,
    @Body() body: UpdateShippingProfileDto,
  ): Promise<ShippingProfileResponse> {
    const { id: shopId } = await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId);

    const result = await this.updateShippingProfileUseCase.execute(shopId, shippingProfileId, {
      version: body.version,
      name: body.name,
      status: body.status,
      shipFromCountry: body.shipFromCountry,
      shipFromPostal: body.shipFromPostal,
      processingTimeMinDays: body.processingTimeMinDays,
      processingTimeMaxDays: body.processingTimeMaxDays,
      rates: body.rates,
    });

    if (!result.isOk) {
      throw mapShippingAppErrorToHttpException(result.error);
    }

    return toShippingProfileResponse(result.value);
  }

  @Post(':shipping_profile_id/archive')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'shipping-profile:archive' })
  @ApiOperation({ summary: 'Archive a shipping profile' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'shipping_profile_id', type: String })
  @ApiOkResponse({ description: 'Archived shipping profile.', schema: { type: 'object' } })
  async archive(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('shipping_profile_id') shippingProfileId: string,
  ): Promise<ShippingProfileResponse> {
    const { id: shopId } = await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId);

    const result = await this.archiveShippingProfileUseCase.execute(shopId, shippingProfileId);

    if (!result.isOk) {
      throw mapShippingAppErrorToHttpException(result.error);
    }

    return toShippingProfileResponse(result.value);
  }

  @Put(':shipping_profile_id/default')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Designate a shipping profile as the shop default' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'shipping_profile_id', type: String })
  @ApiOkResponse({ description: 'Designated shipping profile.', schema: { type: 'object' } })
  async setDefault(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('shipping_profile_id') shippingProfileId: string,
  ): Promise<ShippingProfileResponse> {
    const { id: shopId } = await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId);

    const result = await this.setDefaultShippingProfileUseCase.execute(shopId, shippingProfileId);

    if (!result.isOk) {
      throw mapShippingAppErrorToHttpException(result.error);
    }

    return toShippingProfileResponse(result.value);
  }

  @Delete(':shipping_profile_id/default')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Clear the shop default shipping profile designation' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'shipping_profile_id', type: String })
  @ApiOkResponse({ description: 'Shipping profile with no default designation.', schema: { type: 'object' } })
  async clearDefault(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('shipping_profile_id') shippingProfileId: string,
  ): Promise<ShippingProfileResponse> {
    const { id: shopId } = await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId);

    const result = await this.clearDefaultShippingProfileUseCase.execute(shopId, shippingProfileId);

    if (!result.isOk) {
      throw mapShippingAppErrorToHttpException(result.error);
    }

    return toShippingProfileResponse(result.value);
  }

  @Post(':shipping_profile_id/preview')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Preview a shipping profile for a destination and quantity' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'shipping_profile_id', type: String })
  @ApiOkResponse({ description: 'Shipping rate preview.', schema: { type: 'object' } })
  async preview(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('shipping_profile_id') shippingProfileId: string,
    @Body() body: PreviewShippingProfileDto,
  ): Promise<ShippingRatePreviewResponse> {
    const { id: shopId } = await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId);

    const result = await this.previewShippingProfileUseCase.execute(shopId, shippingProfileId, {
      countryCode: body.countryCode,
      quantity: body.quantity,
    });

    if (!result.isOk) {
      throw mapShippingAppErrorToHttpException(result.error);
    }

    return toShippingRatePreviewResponse(result.value);
  }
}
