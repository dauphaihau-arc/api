import { OrderTotalLimitExceededError } from './errors/order-app.error';
import { OrderTotalPolicyService } from './order-total-policy.service';

describe('OrderTotalPolicyService', () => {
  it('allows totals at the configured currency limit', () => {
    const service = new OrderTotalPolicyService({
      maxOrderTotalByCurrencyMinor: {
        USD: 1000,
      } as never,
    });

    expect(() =>
      service.assertWithinLimit({
        totalMinor: 1000,
        currency: 'USD',
      }),
    ).not.toThrow();
  });

  it('rejects totals above the configured currency limit', () => {
    const service = new OrderTotalPolicyService({
      maxOrderTotalByCurrencyMinor: {
        USD: 1000,
      } as never,
    });

    expect(() =>
      service.assertWithinLimit({
        totalMinor: 1001,
        currency: 'USD',
      }),
    ).toThrow(OrderTotalLimitExceededError);
  });
});
