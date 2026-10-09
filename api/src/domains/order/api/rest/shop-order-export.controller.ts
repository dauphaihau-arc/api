import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { CurrentUser } from '~/platform/decorators/current-user.decorator';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ShopAccessService } from '~/domains/shop/app/services/shop-access.service';

import { OrderPublicIdLookup } from '../../app/services/order-public-id-lookup.service';
import { ExportShopOrdersUseCase } from '../../app/use-cases/export-shop-orders/export-shop-orders.use-case';
import { StartShopOrderExportUseCase } from '../../app/use-cases/start-shop-order-export/start-shop-order-export.use-case';
import { GetShopOrderExportUseCase } from '../../app/use-cases/get-shop-order-export/get-shop-order-export.use-case';
import { DownloadShopOrderExportUseCase } from '../../app/use-cases/download-shop-order-export/download-shop-order-export.use-case';
import { ExportShopOrdersQueryDto } from './dto/export-shop-orders.query.dto';

import { toShopOrderExportResponse } from './responses/order-export.response';
import { OrderExceptionsFilter } from './errors/order-exceptions.filter';

@Controller('shops/:shop_id/orders')
@UseFilters(OrderExceptionsFilter)
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
@ApiTags('Shop Order Exports')
@ApiCookieAuth('accessCookie')
export class ShopOrderExportController {
  constructor(
    private readonly shopAccessService: ShopAccessService,
    private readonly exportShopOrdersUseCase: ExportShopOrdersUseCase,
    private readonly startShopOrderExportUseCase: StartShopOrderExportUseCase,
    private readonly getShopOrderExportUseCase: GetShopOrderExportUseCase,
    private readonly downloadShopOrderExportUseCase: DownloadShopOrderExportUseCase,
    private readonly orderPublicIdLookup: OrderPublicIdLookup,
  ) {}

  @Get('export')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Export shop orders as CSV' })
  @ApiParam({ name: 'shop_id', type: String })
  async exportCsv(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Query() query: ExportShopOrdersQueryDto,
    @Res() response: Response,
  ) {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;

    const exportResult = await this.exportShopOrdersUseCase.execute(shopId, query);

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
    response.send(exportResult.csv);
  }

  @Post('exports')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Start asynchronous shop order CSV export' })
  @ApiParam({ name: 'shop_id', type: String })
  async startExport(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Body() body: ExportShopOrdersQueryDto,
  ) {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;

    return toShopOrderExportResponse(
      await this.startShopOrderExportUseCase.execute(shopId, currentUser, body),
    );
  }

  @Get('exports/:export_id')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get shop order export status' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'export_id', type: String })
  async exportDetail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('export_id') exportPublicId: string,
  ) {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;
    const exportId = await this.orderPublicIdLookup.resolveExportPublicId(exportPublicId);

    return toShopOrderExportResponse(
      await this.getShopOrderExportUseCase.execute(shopId, exportId),
    );
  }

  @Get('exports/:export_id/download')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Download completed shop order export CSV' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'export_id', type: String })
  async downloadExport(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('export_id') exportPublicId: string,
    @Res() response: Response,
  ) {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;
    const exportId = await this.orderPublicIdLookup.resolveExportPublicId(exportPublicId);

    const result = await this.downloadShopOrderExportUseCase.execute(shopId, exportId);

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    response.send(result.body);
  }
}
