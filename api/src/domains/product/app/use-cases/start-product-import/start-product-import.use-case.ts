import ms from 'ms';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { appJobDeduplicationKey } from '~/platform/jobs/app-job-deduplication';
import { appJobName } from '~/platform/jobs/app-job.names';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import {
  PRODUCT_IMPORT_MAX_FILE_SIZE_BYTES,
  PRODUCT_IMPORT_REPORT_RETENTION_DAYS,
  PRODUCT_IMPORT_SOURCE_RETENTION_DAYS,
} from '../../product-import/product-import.constants';
import { ProductImportTemplateError } from '../../product-import/product-import.errors';
import { parseProductImportWorkbook } from '../../product-import/product-import-parser';
import {
  ProductImportCommandRepository,
} from '../../ports/product-import-command.repository';
import type { ProductImportSummary } from '../../ports/product-import.types';

export interface UploadedProductImportFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class StartProductImportUseCase {
  constructor(
    private readonly productImportCommandRepository: ProductImportCommandRepository,
    private readonly storageService: StorageService,
    private readonly jobDispatcher: JobDispatcher,
  ) {}

  async execute(
    shopId: string,
    currentUser: AuthenticatedUser,
    file: UploadedProductImportFile,
  ): Promise<ProductImportSummary> {
    validateUploadFile(file);

    const parsedWorkbook = parseProductImportWorkbook(file.buffer);
    const sourceStorageKey = buildSourceStorageKey(shopId, file.originalname);

    await this.storageService.putObject({
      key: sourceStorageKey,
      body: file.buffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      contentLength: file.size,
    });

    const productImport = await this.productImportCommandRepository.createQueued({
      shopId,
      requestedByUserId: currentUser.userId,
      templateVersion: parsedWorkbook.templateVersion,
      filename: normalizeFilename(file.originalname),
      sourceFileStorageKey: sourceStorageKey,
      totalRows: parsedWorkbook.rows.length,
      sourceExpiresAt: new Date(Date.now() + ms(`${PRODUCT_IMPORT_SOURCE_RETENTION_DAYS}d`)),
      reportExpiresAt: new Date(Date.now() + ms(`${PRODUCT_IMPORT_REPORT_RETENTION_DAYS}d`)),
      rows: parsedWorkbook.rows.map((row) => ({
        rowNumber: row.rowNumber,
        rowJson: { ...row },
        sku: row.sku,
        title: row.title,
      })),
    });

    await this.jobDispatcher.dispatch(
      appJobName.processProductImport,
      { importId: productImport.id },
      {
        deduplicationKey: appJobDeduplicationKey.processProductImport(productImport.id),
        delayMs: 1,
      },
    );

    return productImport;
  }
}

function validateUploadFile(file: UploadedProductImportFile | undefined) {
  if (!file) {
    throw new ProductImportTemplateError('missing_file', 'Missing XLSX file');
  }

  if (file.size > PRODUCT_IMPORT_MAX_FILE_SIZE_BYTES) {
    throw new ProductImportTemplateError('file_too_large', 'XLSX file is larger than 10 MB');
  }

  if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
    throw new ProductImportTemplateError('unsupported_file_type', 'Only XLSX uploads are supported');
  }
}

function buildSourceStorageKey(shopId: string, filename: string) {
  return [
    process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
    'private',
    'shops',
    shopId,
    'product-imports',
    'source',
    `${randomUUID()}-${normalizeFilename(filename)}`,
  ].join('/');
}

function normalizeFilename(filename: string) {
  const normalized = filename.trim().replace(/[^a-zA-Z0-9._-]/g, '-');
  return normalized || 'products.xlsx';
}
