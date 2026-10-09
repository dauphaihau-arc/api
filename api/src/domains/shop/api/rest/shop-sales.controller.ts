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
import { CreateShopSaleUseCase } from '../../app/use-cases/create-shop-sale/create-shop-sale.use-case';
import { ListShopSalesUseCase } from '../../app/use-cases/list-shop-sales/list-shop-sales.use-case';
import { BulkStopShopSalesUseCase } from '../../app/use-cases/bulk-stop-shop-sales/bulk-stop-shop-sales.use-case';
import { ShopSaleStopAction, StopShopSaleUseCase } from '../../app/use-cases/stop-shop-sale/stop-shop-sale.use-case';
import { BulkStopShopSalesDto } from './dto/bulk-stop-shop-sales.dto';
import { CreateShopSaleDto } from './dto/create-shop-sale.dto';
import { ListShopSalesQueryDto } from './dto/list-shop-sales.query.dto';
import { ShopExceptionsFilter } from './errors/shop-exceptions.filter';
import { shopSalesControllerErrorResponses } from './errors/shop-error-responses';
import {
  ShopSaleEnvelopeResponseDto,
  ShopSaleListResponseDto,
  ShopSaleStopListResponseDto,
  toShopSaleListResponse,
  toShopSaleResponse,
  toShopSaleStopListResponse,
} from './responses/shop-sale.response';

@Controller('shops/:shop_id/sales')
@UseFilters(ShopExceptionsFilter)
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
@ApiTags('Shop Sales')
@ApiCookieAuth('accessCookie')
@ApiErrorResponses(shopSalesControllerErrorResponses.common)
export class ShopSalesController {
  constructor(
    private readonly createShopSaleUseCase: CreateShopSaleUseCase,
    private readonly listShopSalesUseCase: ListShopSalesUseCase,
    private readonly stopShopSaleUseCase: StopShopSaleUseCase,
    private readonly bulkStopShopSalesUseCase: BulkStopShopSalesUseCase,
    private readonly shopAccessService: ShopAccessService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a percentage shop sale' })
  @ApiErrorResponses(shopSalesControllerErrorResponses.create)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'Created sale.',
    type: ShopSaleEnvelopeResponseDto,
  })
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Body() body: CreateShopSaleDto,
  ) {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;
    const sale = await this.createShopSaleUseCase.execute(currentUser, shopId, body);

    return { sale: toShopSaleResponse(sale) };
  }

  @Get()
  @ApiOperation({ summary: 'List shop sales' })
  @ApiErrorResponses(shopSalesControllerErrorResponses.list)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'Paginated sale list.',
    type: ShopSaleListResponseDto,
  })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Query() query: ListShopSalesQueryDto,
  ) {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;
    return toShopSaleListResponse(
      await this.listShopSalesUseCase.execute(currentUser, shopId, query),
    );
  }

  @Post(':sale_id/cancel')
  @ApiOperation({ summary: 'Cancel scheduled sale' })
  @ApiErrorResponses(shopSalesControllerErrorResponses.cancel)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'sale_id', type: String })
  @ApiOkResponse({
    description: 'Cancelled sale.',
    type: ShopSaleEnvelopeResponseDto,
  })
  async cancel(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('sale_id') salePublicId: string,
  ) {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;
    const sale = await this.stopShopSaleUseCase.execute(currentUser, shopId, salePublicId, ShopSaleStopAction.CANCEL);
    return { sale: toShopSaleResponse(sale) };
  }

  @Post(':sale_id/end')
  @ApiOperation({ summary: 'End active sale' })
  @ApiErrorResponses(shopSalesControllerErrorResponses.end)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'sale_id', type: String })
  @ApiOkResponse({
    description: 'Ended sale.',
    type: ShopSaleEnvelopeResponseDto,
  })
  async end(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('sale_id') salePublicId: string,
  ) {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;
    const sale = await this.stopShopSaleUseCase.execute(currentUser, shopId, salePublicId, ShopSaleStopAction.END);
    return { sale: toShopSaleResponse(sale) };
  }

  @Post('bulk-stop')
  @ApiOperation({
    summary: 'Stop sales',
    description: 'Cancels scheduled sales and ends active sales.',
  })
  @ApiErrorResponses(shopSalesControllerErrorResponses.bulkStop)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({
    description: 'Per-sale stop outcome.',
    type: ShopSaleStopListResponseDto,
  })
  async bulkStop(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Body() body: BulkStopShopSalesDto,
  ) {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;
    return toShopSaleStopListResponse(
      await this.bulkStopShopSalesUseCase.execute(currentUser, shopId, body.ids),
    );
  }
}
