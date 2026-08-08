import {
  BadRequestException,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
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
import { Idempotent } from '~/platform/decorators/idempotent.decorator';
import { IdempotencyKeyInterceptor } from '~/platform/interceptors/idempotency-key.interceptor';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import { ShopAccessService } from '~/domains/shop/app/services/shop-access.service';
import { DownloadProductImportReportUseCase } from '~/domains/product/app/use-cases/download-product-import-report/download-product-import-report.use-case';
import { DownloadProductImportTemplateUseCase } from '~/domains/product/app/use-cases/download-product-import-template/download-product-import-template.use-case';
import { GetProductImportUseCase } from '~/domains/product/app/use-cases/get-product-import/get-product-import.use-case';
import {
  StartProductImportUseCase,
  type UploadedProductImportFile,
} from '~/domains/product/app/use-cases/start-product-import/start-product-import.use-case';
import {
  ProductImportNotFoundError,
  ProductImportTemplateError,
} from '~/domains/product/app/product-import/product-import.errors';
import {
  toShopProductImportResponse,
  type ShopProductImportResponse,
} from './product-import.response';

@Controller('shops/:shop_id/products/imports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
@ApiTags('Shop Product Imports')
@ApiCookieAuth('accessCookie')
export class ShopProductImportController {
  constructor(
    private readonly shopAccessService: ShopAccessService,
    private readonly downloadProductImportTemplateUseCase: DownloadProductImportTemplateUseCase,
    private readonly startProductImportUseCase: StartProductImportUseCase,
    private readonly getProductImportUseCase: GetProductImportUseCase,
    private readonly downloadProductImportReportUseCase: DownloadProductImportReportUseCase,
  ) {}

  @Get('template')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Download product import XLSX template' })
  @ApiParam({ name: 'shop_id', type: String })
  async downloadTemplate(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Res() response: Response,
  ) {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

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
  @ApiOperation({ summary: 'Start asynchronous product XLSX import' })
  @ApiParam({ name: 'shop_id', type: String })
  async startImport(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @UploadedFile() file?: UploadedProductImportFile,
  ): Promise<ShopProductImportResponse> {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    try {
      return toShopProductImportResponse(
        await this.startProductImportUseCase.execute(shopId, currentUser, file as UploadedProductImportFile),
      );
    }
    catch (error) {
      throwProductImportError(error);
    }
  }

  @Get(':import_id')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get product import status' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'import_id', type: String })
  async importDetail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Param('import_id') importId: string,
  ): Promise<ShopProductImportResponse> {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    try {
      return toShopProductImportResponse(
        await this.getProductImportUseCase.execute(shopId, importId),
      );
    }
    catch (error) {
      throwProductImportError(error);
    }
  }

  @Get(':import_id/report')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Download product import CSV report' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'import_id', type: String })
  async downloadReport(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Param('import_id') importId: string,
    @Res() response: Response,
  ) {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    try {
      const report = await this.downloadProductImportReportUseCase.execute(shopId, importId);

      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
      response.send(report.body);
    }
    catch (error) {
      throwProductImportError(error);
    }
  }
}

function throwProductImportError(error: unknown): never {
  if (error instanceof ProductImportTemplateError) {
    throw new BadRequestException({
      code: error.code,
      message: error.message,
    });
  }

  if (error instanceof ProductImportNotFoundError) {
    throw new NotFoundException(error.message);
  }

  throw error;
}
