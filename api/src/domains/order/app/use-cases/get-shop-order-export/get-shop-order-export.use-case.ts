import { Injectable } from '@nestjs/common';
import { OrderExportNotFoundError } from '../../errors/order-app.error';
import {
  ShopOrderExportRepository,
  type ShopOrderExportSummary,
} from '../../ports/shop-order-export.repository';

@Injectable()
export class GetShopOrderExportUseCase {
  constructor(private readonly orderExportRepository: ShopOrderExportRepository) {}

  async execute(shopId: string, exportId: string): Promise<ShopOrderExportSummary> {
    const orderExport = await this.orderExportRepository.findByShopId(shopId, exportId);

    if (!orderExport) {
      throw new OrderExportNotFoundError();
    }

    return orderExport;
  }
}
