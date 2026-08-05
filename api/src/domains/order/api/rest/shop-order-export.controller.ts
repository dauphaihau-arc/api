import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
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
import { ExportShopOrdersUseCase } from '../../app/use-cases/export-shop-orders/export-shop-orders.use-case';
import { StartShopOrderExportUseCase } from '../../app/use-cases/start-shop-order-export/start-shop-order-export.use-case';
import { GetShopOrderExportUseCase } from '../../app/use-cases/get-shop-order-export/get-shop-order-export.use-case';
import { DownloadShopOrderExportUseCase } from '../../app/use-cases/download-shop-order-export/download-shop-order-export.use-case';
import { ExportShopOrdersQueryDto } from './dto/export-shop-orders.query.dto';
import { toShopOrderExportResponse } from './order-export.response';
import {
  isOrderAppError,
  mapOrderAppErrorToHttpException,
} from './order-http-error-mapper';

@Controller('shops/:shop_id/orders')
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
  ) {}

  @Get('export')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Export shop orders as CSV' })
  @ApiParam({ name: 'shop_id', type: String })
  async exportCsv(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Query() query: ExportShopOrdersQueryDto,
    @Res() response: Response,
  ) {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

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
    @Param('shop_id') shopId: string,
    @Body() body: ExportShopOrdersQueryDto,
  ) {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    try {
      return toShopOrderExportResponse(
        await this.startShopOrderExportUseCase.execute(shopId, currentUser, body),
      );
    }
    catch (error) {
      throwMappedOrderError(error);
    }
  }

  @Get('exports/:export_id')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get shop order export status' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'export_id', type: String })
  async exportDetail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Param('export_id') exportId: string,
  ) {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    try {
      return toShopOrderExportResponse(
        await this.getShopOrderExportUseCase.execute(shopId, exportId),
      );
    }
    catch (error) {
      throwMappedOrderError(error);
    }
  }

  @Get('exports/:export_id/download')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Download completed shop order export CSV' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'export_id', type: String })
  async downloadExport(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Param('export_id') exportId: string,
    @Res() response: Response,
  ) {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    try {
      const result = await this.downloadShopOrderExportUseCase.execute(shopId, exportId);

      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      response.send(result.body);
    }
    catch (error) {
      throwMappedOrderError(error);
    }
  }
}

function throwMappedOrderError(error: unknown): never {
  if (isOrderAppError(error)) {
    throw mapOrderAppErrorToHttpException(error);
  }

  throw error;
}
