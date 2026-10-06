import { Injectable, Logger } from '@nestjs/common';
import type { AppJobPayloadMap } from '~/platform/jobs/app-job.types';
import { CheckoutStockReservationPort } from '~/domains/checkout/app/ports/checkout-stock-reservation.port';

type CleanupExpiredOrderReservationsPayload =
  AppJobPayloadMap['order.cleanup-expired-order-reservations'];

/**
 * Fallback release for an Order-owned hold whose payment session never
 * resolved. The provider expiry webhook is the primary release; this job
 * expires the hold on its own schedule when that webhook never arrives.
 */
@Injectable()
export class CleanupExpiredOrderReservationsJob {
  private readonly logger = new Logger(CleanupExpiredOrderReservationsJob.name);

  constructor(
    private readonly checkoutStockReservationService: CheckoutStockReservationPort,
  ) {}

  async run(
    payload: CleanupExpiredOrderReservationsPayload,
  ): Promise<void> {
    const expiredCount = await this.checkoutStockReservationService.cleanupExpiredForOrder(
      payload.orderId,
      payload.reservationId ? { reservationId: payload.reservationId } : undefined,
    );

    if (expiredCount > 0) {
      this.logger.log(
        `Expired ${expiredCount} checkout stock reservations for order ${payload.orderId}`,
      );
    }
  }
}
