import { Injectable } from '@nestjs/common';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { OrderExportStatus } from '../../../domain/enums/order-export-status.enum';
import {
  OrderExportNotFoundError,
  OrderExportNotReadyError,
} from '../../errors/order-app.error';
import { ShopOrderExportRepository } from '../../ports/shop-order-export.repository';

export interface DownloadShopOrderExportResult {
  filename: string;
  body: Buffer;
}

@Injectable()
export class DownloadShopOrderExportUseCase {
  constructor(
    private readonly orderExportRepository: ShopOrderExportRepository,
    private readonly storageService: StorageService,
  ) {}

  async execute(
    shopId: string,
    exportId: string,
  ): Promise<DownloadShopOrderExportResult> {
    const orderExport = await this.orderExportRepository.findByShopId(shopId, exportId);

    if (!orderExport) {
      throw new OrderExportNotFoundError();
    }

    if (
      orderExport.status !== OrderExportStatus.COMPLETED
      || !orderExport.fileStorageKey
    ) {
      throw new OrderExportNotReadyError();
    }

    return {
      filename: orderExport.filename,
      body: await this.storageService.getObject(orderExport.fileStorageKey),
    };
  }
}
