import { Injectable, Logger } from '@nestjs/common';
import type { AppJobPayloadMap } from '~/platform/jobs/app-job.types';
import { CheckoutStockReservationPort } from '~/domains/checkout/app/ports/checkout-stock-reservation.port';
import { dispatchCatalogProductProjections } from '~/domains/product/app/catalog-product-projection-dispatch';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';

type CleanupExpiredCheckoutQuoteReservationsPayload =
  AppJobPayloadMap['order.cleanup-expired-checkout-quote-reservations'];

@Injectable()
export class CleanupExpiredCheckoutQuoteReservationsJob {
  private readonly logger = new Logger(CleanupExpiredCheckoutQuoteReservationsJob.name);

  constructor(
    private readonly checkoutStockReservationService: CheckoutStockReservationPort,
    private readonly jobDispatcher: JobDispatcher,
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
      await dispatchCatalogProductProjections(
        this.jobDispatcher,
        payload.productIds ?? [],
      );
    }
  }
}
