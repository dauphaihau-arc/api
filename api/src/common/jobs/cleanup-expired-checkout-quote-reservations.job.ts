import { Injectable, Logger } from '@nestjs/common';
import type { AppJobPayloadMap } from './job.types';
import { CheckoutStockReservationService } from '~/modules/domains/order/app/checkout-stock-reservation.service';

type CleanupExpiredCheckoutQuoteReservationsPayload =
  AppJobPayloadMap['order.cleanup-expired-checkout-quote-reservations'];

@Injectable()
export class CleanupExpiredCheckoutQuoteReservationsJob {
  private readonly logger = new Logger(CleanupExpiredCheckoutQuoteReservationsJob.name);

  constructor(
    private readonly checkoutStockReservationService: CheckoutStockReservationService,
  ) {}

  async run(
    payload: CleanupExpiredCheckoutQuoteReservationsPayload,
  ): Promise<void> {
    const expiredCount = await this.checkoutStockReservationService.cleanupExpiredForQuote(
      payload.quoteId,
    );

    if (expiredCount > 0) {
      this.logger.log(
        `Expired ${expiredCount} checkout stock reservations for quote ${payload.quoteId}`,
      );
    }
  }
}
