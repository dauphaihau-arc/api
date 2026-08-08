import { Injectable } from '@nestjs/common';
import { buildProductImportTemplateWorkbook } from '../../product-import/product-import-template';

@Injectable()
export class DownloadProductImportTemplateUseCase {
  execute(): Buffer {
    return buildProductImportTemplateWorkbook();
  }
}
