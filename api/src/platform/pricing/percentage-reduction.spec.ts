import { applyPercentageReduction } from './percentage-reduction';

describe('applyPercentageReduction', () => {
  it('reduces at the shared money precision and reports the regular price', () => {
    expect(applyPercentageReduction(1500, 'USD', 60)).toEqual({
      amountMinor: 600,
      originalAmountMinor: 1500,
    });
  });

  it('rounds exactly instead of letting a binary float decide', () => {
    // $10.50 less 5% is 997.5 minor units and half-up is 998. Deriving a
    // major-unit float first gives 9.9749999999999996 and yields 997.
    expect(applyPercentageReduction(1050, 'USD', 5)).toEqual({
      amountMinor: 998,
      originalAmountMinor: 1050,
    });
  });

  it('reports nothing when the reduction is not genuine', () => {
    expect(applyPercentageReduction(1500, 'USD', 0)).toBeUndefined();
    expect(applyPercentageReduction(1500, 'USD', undefined)).toBeUndefined();
  });

  it('follows the currency scale', () => {
    expect(applyPercentageReduction(1500, 'JPY', 50)).toEqual({
      amountMinor: 750,
      originalAmountMinor: 1500,
    });
  });
});
