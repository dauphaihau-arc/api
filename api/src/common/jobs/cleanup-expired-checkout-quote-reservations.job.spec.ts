import { CleanupExpiredCheckoutQuoteReservationsJob } from './cleanup-expired-checkout-quote-reservations.job';

describe('CleanupExpiredCheckoutQuoteReservationsJob', () => {
  it('delegates quote cleanup to the reservation service', async () => {
    const checkoutStockReservationService = {
      cleanupExpiredForQuote: jest.fn().mockResolvedValue(2),
    };

    const job = new CleanupExpiredCheckoutQuoteReservationsJob(
      checkoutStockReservationService as never,
    );

    await job.run({ quoteId: 'quote-1' });

    expect(checkoutStockReservationService.cleanupExpiredForQuote).toHaveBeenCalledWith('quote-1');
  });
});
