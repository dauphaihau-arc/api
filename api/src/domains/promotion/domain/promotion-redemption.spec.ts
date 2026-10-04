import {
  PromotionRedemptionLimitReachedError,
  PromotionRedemptionRequiresAuthenticatedBuyerError,
  assertRedemptionAllowed,
} from './promotion-redemption';

describe('promotion-redemption', () => {
  const code = 'SAVE10';

  it('allows a redemption when no limit is configured', () => {
    expect(() =>
      assertRedemptionAllowed({
        code,
        maxRedemptions: null,
        maxRedemptionsPerBuyer: null,
        totalCount: 100,
        buyerCount: 50,
        authenticated: false,
      }),
    ).not.toThrow();
  });

  it('allows a redemption while the total limit still has room', () => {
    expect(() =>
      assertRedemptionAllowed({
        code,
        maxRedemptions: 2,
        maxRedemptionsPerBuyer: null,
        totalCount: 1,
        buyerCount: 0,
        authenticated: false,
      }),
    ).not.toThrow();
  });

  it('rejects a redemption that would exceed the total limit', () => {
    expect(() =>
      assertRedemptionAllowed({
        code,
        maxRedemptions: 2,
        maxRedemptionsPerBuyer: null,
        totalCount: 2,
        buyerCount: 0,
        authenticated: true,
      }),
    ).toThrow(PromotionRedemptionLimitReachedError);
  });

  it('rejects a redemption that would exceed the per-buyer limit', () => {
    expect(() =>
      assertRedemptionAllowed({
        code,
        maxRedemptions: null,
        maxRedemptionsPerBuyer: 1,
        totalCount: 5,
        buyerCount: 1,
        authenticated: true,
      }),
    ).toThrow(PromotionRedemptionLimitReachedError);
  });

  it('requires an authenticated buyer for a per-buyer limit', () => {
    expect(() =>
      assertRedemptionAllowed({
        code,
        maxRedemptions: null,
        maxRedemptionsPerBuyer: 1,
        totalCount: 0,
        buyerCount: 0,
        authenticated: false,
      }),
    ).toThrow(PromotionRedemptionRequiresAuthenticatedBuyerError);
  });

  it('allows an authenticated buyer under the per-buyer limit', () => {
    expect(() =>
      assertRedemptionAllowed({
        code,
        maxRedemptions: null,
        maxRedemptionsPerBuyer: 1,
        totalCount: 0,
        buyerCount: 0,
        authenticated: true,
      }),
    ).not.toThrow();
  });
});
