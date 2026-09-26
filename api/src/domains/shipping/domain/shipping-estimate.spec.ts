import { calculateShippingEstimate, tryCalculateShippingEstimate } from './shipping-estimate';

describe('calculateShippingEstimate', () => {
  it('combines the processing and delivery ranges by adding their bounds', () => {
    const estimate = calculateShippingEstimate({
      processingTimeMinDays: 1,
      processingTimeMaxDays: 3,
      deliveryTimeMinDays: 2,
      deliveryTimeMaxDays: 4,
      anchorAt: new Date('2026-09-21T09:30:00.000Z'),
    });

    expect(estimate).toMatchObject({
      processingTimeMinDays: 1,
      processingTimeMaxDays: 3,
      deliveryTimeMinDays: 2,
      deliveryTimeMaxDays: 4,
      combinedMinDays: 3,
      combinedMaxDays: 7,
    });
    expect(estimate.anchorAt.toISOString()).toBe('2026-09-21T09:30:00.000Z');
  });

  it('anchors the estimated dates to the UTC day of the anchor timestamp', () => {
    const estimate = calculateShippingEstimate({
      processingTimeMinDays: 1,
      processingTimeMaxDays: 3,
      deliveryTimeMinDays: 2,
      deliveryTimeMaxDays: 4,
      anchorAt: new Date('2026-09-21T23:59:59.000Z'),
    });

    expect(estimate.earliestDeliveryDate.toISOString()).toBe('2026-09-24T00:00:00.000Z');
    expect(estimate.latestDeliveryDate.toISOString()).toBe('2026-09-28T00:00:00.000Z');
  });

  it('keeps a zero-day range on the anchor day instead of shifting it', () => {
    const estimate = calculateShippingEstimate({
      processingTimeMinDays: 0,
      processingTimeMaxDays: 0,
      deliveryTimeMinDays: 0,
      deliveryTimeMaxDays: 0,
      anchorAt: new Date('2026-09-21T05:00:00.000Z'),
    });

    expect(estimate.combinedMinDays).toBe(0);
    expect(estimate.combinedMaxDays).toBe(0);
    expect(estimate.earliestDeliveryDate.toISOString()).toBe('2026-09-21T00:00:00.000Z');
    expect(estimate.latestDeliveryDate.toISOString()).toBe('2026-09-21T00:00:00.000Z');
  });

  it('counts elapsed calendar days across month boundaries', () => {
    const estimate = calculateShippingEstimate({
      processingTimeMinDays: 0,
      processingTimeMaxDays: 1,
      deliveryTimeMinDays: 3,
      deliveryTimeMaxDays: 5,
      anchorAt: new Date('2026-01-30T12:00:00.000Z'),
    });

    expect(estimate.earliestDeliveryDate.toISOString()).toBe('2026-02-02T00:00:00.000Z');
    expect(estimate.latestDeliveryDate.toISOString()).toBe('2026-02-05T00:00:00.000Z');
  });

  it('does not depend on the local timezone of the running process', () => {
    const anchor = new Date('2026-06-15T23:30:00.000Z');
    const estimate = calculateShippingEstimate({
      processingTimeMinDays: 0,
      processingTimeMaxDays: 0,
      deliveryTimeMinDays: 1,
      deliveryTimeMaxDays: 2,
      anchorAt: anchor,
    });

    expect(estimate.earliestDeliveryDate.toISOString()).toBe('2026-06-16T00:00:00.000Z');
    expect(estimate.latestDeliveryDate.toISOString()).toBe('2026-06-17T00:00:00.000Z');
  });
});

describe('tryCalculateShippingEstimate', () => {
  const anchorAt = new Date('2026-09-21T09:30:00.000Z');

  it('returns an estimate only when both ranges are complete and valid', () => {
    expect(tryCalculateShippingEstimate({
      processingTimeMinDays: 1,
      processingTimeMaxDays: 2,
      deliveryTimeMinDays: 3,
      deliveryTimeMaxDays: 4,
      anchorAt,
    })).toMatchObject({ combinedMinDays: 4, combinedMaxDays: 6 });
  });

  it('returns nothing for a missing processing range instead of assuming zero days', () => {
    expect(tryCalculateShippingEstimate({
      deliveryTimeMinDays: 3,
      deliveryTimeMaxDays: 4,
      anchorAt,
    })).toBeUndefined();

    expect(tryCalculateShippingEstimate({
      processingTimeMinDays: 1,
      processingTimeMaxDays: 2,
      anchorAt,
    })).toBeUndefined();
  });

  it('returns nothing for a partial or inverted range', () => {
    expect(tryCalculateShippingEstimate({
      processingTimeMinDays: 1,
      processingTimeMaxDays: 2,
      deliveryTimeMinDays: 3,
      anchorAt,
    })).toBeUndefined();

    expect(tryCalculateShippingEstimate({
      processingTimeMinDays: 5,
      processingTimeMaxDays: 2,
      deliveryTimeMinDays: 3,
      deliveryTimeMaxDays: 4,
      anchorAt,
    })).toBeUndefined();
  });

  it('treats stored null bounds as not configured', () => {
    expect(tryCalculateShippingEstimate({
      processingTimeMinDays: null,
      processingTimeMaxDays: null,
      deliveryTimeMinDays: 3,
      deliveryTimeMaxDays: 4,
      anchorAt,
    })).toBeUndefined();
  });
});
