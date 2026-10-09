import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { CurrentUser } from '~/platform/decorators/current-user.decorator';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { Idempotent } from '~/platform/idempotency/idempotent.decorator';
import { IdempotencyKeyInterceptor } from '~/platform/idempotency/idempotency-key.interceptor';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import { ShopAccessService } from '~/domains/shop/app/services/shop-access.service';
import { ProductImportLookupService } from '~/domains/product/app/services/product-import-lookup.service';
import { DownloadProductImportReportUseCase } from '~/domains/product/app/use-cases/download-product-import-report/download-product-import-report.use-case';
import { DownloadProductImportTemplateUseCase } from '~/domains/product/app/use-cases/download-product-import-template/download-product-import-template.use-case';
import { GetProductImportUseCase } from '~/domains/product/app/use-cases/get-product-import/get-product-import.use-case';
import {
  StartProductImportUseCase,
  type UploadedProductImportFile,
} from '~/domains/product/app/use-cases/start-product-import/start-product-import.use-case';
import { ProductImportExceptionsFilter } from './errors/product-import-exceptions.filter';
import { shopProductImportControllerErrorResponses } from './errors/shop-error-responses';
import {
  toShopProductImportResponse,
  type ShopProductImportResponse,
} from './responses/product-import.response';

@Controller('shops/:shop_id/products/imports')
@UseFilters(ProductImportExceptionsFilter)
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
@ApiTags('Shop Product Imports')
@ApiCookieAuth('accessCookie')
@ApiErrorResponses(shopProductImportControllerErrorResponses.common)
export class ShopProductImportController {
  constructor(
    private readonly shopAccessService: ShopAccessService,
    private readonly downloadProductImportTemplateUseCase: DownloadProductImportTemplateUseCase,
    private readonly startProductImportUseCase: StartProductImportUseCase,
    private readonly getProductImportUseCase: GetProductImportUseCase,
    private readonly downloadProductImportReportUseCase: DownloadProductImportReportUseCase,
    private readonly productImportLookupService: ProductImportLookupService,
  ) {}

  @Get('template')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Download import template',
    description: 'Downloads the XLSX template for importing shop products.',
  })
  @ApiErrorResponses(shopProductImportControllerErrorResponses.template)
  @ApiParam({ name: 'shop_id', type: String })
  async downloadTemplate(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Res() response: Response,
  ) {
    await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId);

    const workbook = this.downloadProductImportTemplateUseCase.execute();

    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader('Content-Disposition', 'attachment; filename="product-import-template.xlsx"');
    response.send(workbook);
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(FileInterceptor('file'), IdempotencyKeyInterceptor)
  @Idempotent({ scope: 'product-import:start' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Start product import',
    description: 'Starts an asynchronous product import from an XLSX file.',
  })
  @ApiErrorResponses(shopProductImportControllerErrorResponses.start)
  @ApiParam({ name: 'shop_id', type: String })
  async startImport(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @UploadedFile() file?: UploadedProductImportFile,
  ): Promise<ShopProductImportResponse> {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;

    return toShopProductImportResponse(
      await this.startProductImportUseCase.execute(shopId, currentUser, file as UploadedProductImportFile),
    );
  }

  @Get(':import_id')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({
    summary: 'Get import status',
    description: 'Returns the status of a shop product import.',
  })
  @ApiErrorResponses(shopProductImportControllerErrorResponses.detail)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'import_id', type: String })
  async importDetail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('import_id') importPublicId: string,
  ): Promise<ShopProductImportResponse> {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;
    const importId = await this.productImportLookupService.resolvePublicId(importPublicId);

    return toShopProductImportResponse(
      await this.getProductImportUseCase.execute(shopId, importId),
    );
  }

  @Get(':import_id/report')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Download import report',
    description: 'Downloads the CSV report for a product import.',
  })
  @ApiErrorResponses(shopProductImportControllerErrorResponses.report)
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'import_id', type: String })
  async downloadReport(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('import_id') importPublicId: string,
    @Res() response: Response,
  ) {
    const shopId = (await this.shopAccessService.resolveManageableShopByPublicId(currentUser, shopPublicId)).id;
    const importId = await this.productImportLookupService.resolvePublicId(importPublicId);

    const report = await this.downloadProductImportReportUseCase.execute(shopId, importId);

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    response.send(report.body);
  }
}
