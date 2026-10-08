import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderRefundQueryRepository } from '../ports/order-refund-query.repository';
import { ShopOrderExportRepository } from '../ports/shop-order-export.repository';

@Injectable()
export class OrderPublicIdLookup {
  constructor(
    private readonly orderRepository: OrderRefundQueryRepository,
    private readonly exportRepository: ShopOrderExportRepository,
  ) {}

  async resolveOrderPublicId(publicId: string): Promise<string> {
    const orderId = await this.orderRepository.findByPublicId(publicId);
    if (!orderId) throw new NotFoundException('Order was not found');
    return orderId;
  }

  resolveOrderPublicIds(publicIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return this.orderRepository.findIdsByPublicIds(publicIds);
  }

  async resolveExportPublicId(publicId: string): Promise<string> {
    const exportId = await this.exportRepository.findByPublicId(publicId);
    if (!exportId) throw new NotFoundException('Order export was not found');
    return exportId;
  }
}
