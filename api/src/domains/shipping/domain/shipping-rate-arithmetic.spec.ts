import { ShippingDestinationScope } from './enums/shipping-destination-scope.enum';
import { calculateShippingRateArithmetic } from './shipping-rate-arithmetic';

const rate = {
  id: 'rate-1',
  position: 1,
  destinationScope: ShippingDestinationScope.COUNTRY,
  destinationCountry: 'US',
  oneItemFeeMinor: 500,
  additionalItemFeeMinor: 150,
};

describe('calculateShippingRateArithmetic', () => {
  it('charges the one-item fee once for a single purchased unit', () => {
    expect(calculateShippingRateArithmetic(rate, 1)).toEqual({
      quantity: 1,
      baseItemFeeMinor: 500,
      additionalItemFeeMinor: 150,
      baseItemTotalMinor: 500,
      additionalItemsQuantity: 0,
      additionalItemsTotalMinor: 0,
      totalMinor: 500,
    });
  });

  it('adds the additional-item fee for every remaining unit', () => {
    expect(calculateShippingRateArithmetic(rate, 4)).toMatchObject({
      baseItemTotalMinor: 500,
      additionalItemsQuantity: 3,
      additionalItemsTotalMinor: 450,
      totalMinor: 950,
    });
  });

  it('keeps zero fees at zero', () => {
    expect(
      calculateShippingRateArithmetic({ ...rate, oneItemFeeMinor: 0, additionalItemFeeMinor: 0 }, 5),
    ).toMatchObject({ totalMinor: 0 });
  });

  it('rejects a non-positive or fractional quantity instead of charging a fee', () => {
    expect(calculateShippingRateArithmetic(rate, 0).totalMinor).toBe(0);
    expect(calculateShippingRateArithmetic(rate, -3).totalMinor).toBe(0);
    expect(calculateShippingRateArithmetic(rate, 2.5).totalMinor).toBe(0);
  });
});
