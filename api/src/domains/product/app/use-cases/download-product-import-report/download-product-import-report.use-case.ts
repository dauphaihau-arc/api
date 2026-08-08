import { Injectable } from '@nestjs/common';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { ProductImportStatus } from '../../../domain/enums/product-import-status.enum';
import { ProductImportNotFoundError } from '../../product-import/product-import.errors';
import { ProductImportQueryRepository } from '../../ports/product-import-query.repository';

export interface ProductImportReportDownload {
  filename: string;
  body: Buffer;
}

@Injectable()
export class DownloadProductImportReportUseCase {
  constructor(
    private readonly productImportQueryRepository: ProductImportQueryRepository,
    private readonly storageService: StorageService,
  ) {}

  async execute(shopId: string, importId: string): Promise<ProductImportReportDownload> {
    const productImport = await this.productImportQueryRepository.findByShopId(shopId, importId);

    if (!productImport || !productImport.reportFileStorageKey) {
      throw new ProductImportNotFoundError(importId);
    }

    if (
      productImport.status !== ProductImportStatus.COMPLETED
      && productImport.status !== ProductImportStatus.FAILED
    ) {
      throw new ProductImportNotFoundError(importId);
    }

    return {
      filename: `product-import-${productImport.id}.csv`,
      body: await this.storageService.getObject(productImport.reportFileStorageKey),
    };
  }
}
