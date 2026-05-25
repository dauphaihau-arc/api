import { Injectable } from '@nestjs/common';
import type { AppJobPayloadMap } from './job.types';
import { OrderRefundService } from '~/modules/domains/order/app/order-refund.service';

type ProcessOrderRefundPayload =
  AppJobPayloadMap['order.process-refund'];

@Injectable()
export class ProcessOrderRefundJob {
  constructor(private readonly orderRefundService: OrderRefundService) {}

  async run(payload: ProcessOrderRefundPayload): Promise<void> {
    await this.orderRefundService.processRefund(payload.orderId);
  }
}
