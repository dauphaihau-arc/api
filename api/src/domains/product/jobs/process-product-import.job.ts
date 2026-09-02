import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import type { AppJobPayloadMap } from '~/platform/jobs/app-job.types';
import { toMinorUnits } from '~/platform/utils/money';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import { ShopRepository } from '~/domains/shop/app/ports/shop.repository';
import { ProductWhoMade } from '../domain/enums/product-who-made.enum';
import { ProductVariantType } from '../domain/enums/product-variant-type.enum';
import { ProductImportRowStatus } from '../domain/enums/product-import-row-status.enum';
import { ProductImportStatus } from '../domain/enums/product-import-status.enum';
import {
  PRODUCT_IMPORT_COMPLETED_SSE_EVENT,
  PRODUCT_IMPORT_FAILED_SSE_EVENT,
  PRODUCT_IMPORT_PROGRESS_SSE_EVENT,
} from '../app/events/product-import-sse.event';
import {
  PRODUCT_IMPORT_PRODUCTS_SHEET,
} from '../app/product-import/product-import.constants';
import { parseProductImportWorkbook, type ParsedProductImportRow } from '../app/product-import/product-import-parser';
import { buildProductImportReportCsv } from '../app/product-import/product-import-report';
import { ProductImportCommandRepository } from '../app/ports/product-import-command.repository';
import {
  ProductImportQueryRepository,
} from '../app/ports/product-import-query.repository';
import { ProductImportValidationQueryRepository } from '../app/ports/product-import-validation-query.repository';
import type {
  ProductImportRowResult,
  ProductImportSummary,
  ResolvedImportCategory,
} from '../app/ports/product-import.types';
import { CreateProductDraftFacadeUseCase } from '../app/use-cases/create-product-draft-facade/create-product-draft-facade.use-case';

type ProcessProductImportPayload = AppJobPayloadMap['product.process-import'];

type RowFailure = {
  code: string;
  message: string;
};

type RowValidationResult =
  | {
    isValid: true;
    category: ResolvedImportCategory;
  }
  | {
    isValid: false;
    failure: RowFailure;
  };

@Injectable()
export class ProcessProductImportJob {
  constructor(
    private readonly productImportCommandRepository: ProductImportCommandRepository,
    private readonly productImportQueryRepository: ProductImportQueryRepository,
    private readonly productImportValidationQueryRepository: ProductImportValidationQueryRepository,
    private readonly createProductDraftFacadeUseCase: CreateProductDraftFacadeUseCase,
    private readonly storageService: StorageService,
    private readonly shopRepository: ShopRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async run(payload: ProcessProductImportPayload): Promise<void> {
    const existingImport = await this.productImportQueryRepository.findForProcessing(payload.importId);

    if (!existingImport) {
      return;
    }

    let productImport = existingImport;
    const actor = buildImportActor(productImport.requestedByUserId);

    try {
      productImport = await this.productImportCommandRepository.markProcessing(productImport.id) ?? productImport;
      this.publishProgress(productImport);

      const sourceFile = await this.storageService.getObject(productImport.sourceFileStorageKey);
      const shop = await this.shopRepository.findById(productImport.shopId);
      if (!shop) {
        throw new Error(`Shop "${productImport.shopId}" was not found`);
      }

      const parsedWorkbook = parseProductImportWorkbook(sourceFile);
      const rowsByNumber = new Map(parsedWorkbook.rows.map((row) => [row.rowNumber, row]));
      const rowResults = await this.productImportQueryRepository.listRows(productImport.id);
      const skuCounts = countSkus(parsedWorkbook.rows);

      for (const rowResult of rowResults) {
        if (rowResult.status === ProductImportRowStatus.CREATED) {
          continue;
        }

        const parsedRow = rowsByNumber.get(rowResult.rowNumber);
        if (!parsedRow) {
          productImport = await this.markRowFailedAndPublish(
            productImport,
            productImport.id,
            rowResult.rowNumber,
            'row_not_found',
            `Row ${rowResult.rowNumber} was not found in the ${PRODUCT_IMPORT_PRODUCTS_SHEET} sheet`,
          );
          continue;
        }

        const validationResult = await this.validateRow(
          productImport.shopId,
          parsedRow,
          skuCounts,
          shop.currency,
        );

        if (!validationResult.isValid) {
          productImport = await this.markRowFailedAndPublish(
            productImport,
            productImport.id,
            parsedRow.rowNumber,
            validationResult.failure.code,
            validationResult.failure.message,
          );
          continue;
        }

        const createResult = await this.createProductDraftFacadeUseCase.execute(actor, {
          shopId: productImport.shopId,
          categoryId: validationResult.category.id,
          title: parsedRow.title ?? '',
          description: parsedRow.description ?? '',
          whoMade: parsedRow.whoMade ?? ProductWhoMade.I_DID,
          isDigital: parsedRow.isDigital ?? false,
          nonTaxable: parsedRow.nonTaxable ?? false,
          variantType: ProductVariantType.NONE,
          inventory: [{
            sku: parsedRow.sku,
            stock: parsedRow.stock ?? 0,
          }],
          pricing: [{
            amountMinor: toMinorUnits(parsedRow.price ?? 0, shop.currency),
          }],
        });

        if (!createResult.isOk) {
          productImport = await this.markRowFailedAndPublish(
            productImport,
            productImport.id,
            parsedRow.rowNumber,
            'product_create_failed',
            createResult.error.message,
          );
          continue;
        }

        await this.productImportCommandRepository.markRowCreated(
          productImport.id,
          parsedRow.rowNumber,
          createResult.value.id,
        );
        productImport = await this.productImportCommandRepository.syncProgress(productImport.id) ?? productImport;
        this.publishProgress(productImport);
      }

      const finalRows = await this.productImportQueryRepository.listRows(productImport.id);
      const reportStorageKey = await this.uploadReport(productImport.shopId, productImport.id, finalRows);
      const createdRows = finalRows.filter((row) => row.status === ProductImportRowStatus.CREATED).length;
      const failedRows = finalRows.filter((row) => row.status === ProductImportRowStatus.FAILED).length;

      productImport = await this.productImportCommandRepository.markCompleted({
        importId: productImport.id,
        reportFileStorageKey: reportStorageKey,
        processedRows: createdRows + failedRows,
        createdRows,
        failedRows,
        completedAt: new Date(),
      }) ?? {
        ...productImport,
        status: ProductImportStatus.COMPLETED,
        processedRows: createdRows + failedRows,
        createdRows,
        failedRows,
      };
      this.publishCompleted(productImport);
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown product import error';
      const rows = await this.productImportQueryRepository.listRows(productImport.id);

      const reportStorageKey = await this.uploadReport(productImport.shopId, productImport.id, rows);

      productImport = await this.productImportCommandRepository.syncProgress(productImport.id) ?? productImport;

      productImport = await this.productImportCommandRepository.markFailed(productImport.id, message, reportStorageKey) ?? {
        ...productImport,
        status: ProductImportStatus.FAILED,
        errorMessage: message,
      };

      this.publishFailed(productImport, message);

      throw error;
    }
  }

  private async validateRow(
    shopId: string,
    row: ParsedProductImportRow,
    skuCounts: Map<string, number>,
    currency: string,
  ): Promise<RowValidationResult> {
    if (row.formulaColumns.length > 0) {
      return invalidRow({
        code: 'formula_cell',
        message: `Formula cells are not supported: ${row.formulaColumns.join(', ')}`,
      });
    }

    if (row.invalidColumns.length > 0) {
      return invalidRow({
        code: 'invalid_cell_value',
        message: `Invalid values: ${row.invalidColumns.join(', ')}`,
      });
    }

    for (const field of ['title', 'description', 'categoryPath'] as const) {
      if (!row[field]) {
        return invalidRow({
          code: 'missing_required_value',
          message: `${field} is required`,
        });
      }
    }

    if (row.price === undefined || Number.isNaN(row.price)) {
      return invalidRow({ code: 'invalid_price', message: 'price must be a numeric value' });
    }

    if (row.price < 0) {
      return invalidRow({ code: 'invalid_price', message: 'price cannot be negative' });
    }

    if (toMinorUnits(row.price, currency) < 50) {
      return invalidRow({ code: 'invalid_price', message: 'price is below the minimum amount' });
    }


    if (row.stock === undefined || Number.isNaN(row.stock) || row.stock < 0) {
      return invalidRow({ code: 'invalid_stock', message: 'stock must be a non-negative whole number' });
    }

    const categoryMatches = await this.productImportValidationQueryRepository.resolveCategoryPath(row.categoryPath ?? '');
    if (categoryMatches.length === 0) {
      return invalidRow({ code: 'category_not_found', message: `Category "${row.categoryPath}" was not found` });
    }

    if (categoryMatches.length > 1) {
      return invalidRow({
        code: 'category_ambiguous',
        message: `Category "${row.categoryPath}" matches multiple categories`,
      });
    }

    if (row.sku) {
      if ((skuCounts.get(row.sku.trim()) ?? 0) > 1) {
        return invalidRow({
          code: 'duplicate_sku_in_file',
          message: `SKU "${row.sku}" appears more than once in the file`,
        });
      }

      if (await this.productImportValidationQueryRepository.skuExists(shopId, row.sku.trim())) {
        return invalidRow({ code: 'sku_exists', message: `SKU "${row.sku}" already exists in this shop` });
      }
    }

    return {
      isValid: true,
      category: categoryMatches[0],
    };
  }

  private async uploadReport(
    shopId: string,
    importId: string,
    rows: ProductImportRowResult[],
  ) {
    const storageKey = [
      process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
      'private',
      'shops',
      shopId,
      'product-imports',
      importId,
      `${randomUUID()}-report.csv`,
    ].join('/');
    const body = Buffer.from(buildProductImportReportCsv(rows), 'utf8');

    await this.storageService.putObject({
      key: storageKey,
      body,
      contentType: 'text/csv; charset=utf-8',
      contentLength: body.length,
    });

    return storageKey;
  }

  private async markRowFailedAndPublish(
    productImport: ProductImportSummary,
    importId: string,
    rowNumber: number,
    errorCode: string,
    errorMessage: string,
  ) {
    await this.productImportCommandRepository.markRowFailed(
      importId,
      rowNumber,
      errorCode,
      errorMessage,
    );

    const updatedImport = await this.productImportCommandRepository.syncProgress(importId) ?? productImport;
    this.publishProgress(updatedImport);

    return updatedImport;
  }

  private publishProgress(productImport: ProductImportSummary) {
    this.eventEmitter.emit(PRODUCT_IMPORT_PROGRESS_SSE_EVENT, {
      userId: productImport.requestedByUserId,
      importId: productImport.id,
      status: productImport.status === ProductImportStatus.QUEUED ? 'queued' : 'processing',
      processedRows: productImport.processedRows,
      createdRows: productImport.createdRows,
      failedRows: productImport.failedRows,
      totalRows: productImport.totalRows,
      filename: productImport.filename,
    });
  }

  private publishCompleted(productImport: ProductImportSummary) {
    this.eventEmitter.emit(PRODUCT_IMPORT_COMPLETED_SSE_EVENT, {
      userId: productImport.requestedByUserId,
      importId: productImport.id,
      status: 'completed',
      processedRows: productImport.processedRows,
      createdRows: productImport.createdRows,
      failedRows: productImport.failedRows,
      totalRows: productImport.totalRows,
      filename: productImport.filename,
    });
  }

  private publishFailed(productImport: ProductImportSummary, message: string) {
    this.eventEmitter.emit(PRODUCT_IMPORT_FAILED_SSE_EVENT, {
      userId: productImport.requestedByUserId,
      importId: productImport.id,
      status: 'failed',
      processedRows: productImport.processedRows,
      createdRows: productImport.createdRows,
      failedRows: productImport.failedRows,
      totalRows: productImport.totalRows,
      filename: productImport.filename,
      message,
    });
  }
}

function countSkus(rows: ParsedProductImportRow[]) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (!row.sku) {
      continue;
    }

    const sku = row.sku.trim();
    counts.set(sku, (counts.get(sku) ?? 0) + 1);
  }

  return counts;
}

function invalidRow(failure: RowFailure): RowValidationResult {
  return {
    isValid: false,
    failure,
  };
}

function buildImportActor(userId: string): AuthenticatedUser {
  return {
    userId,
    email: '',
    status: UserStatus.ACTIVE,
    roles: [],
    permissions: [],
    sessionId: '',
  } as unknown as AuthenticatedUser;
}
