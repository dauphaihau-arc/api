import type { ShippingDestinationRate } from './shipping-destination-matcher';

export interface ShippingRateArithmetic {
  quantity: number;
  baseItemFeeMinor: number;
  additionalItemFeeMinor: number;
  baseItemTotalMinor: number;
  additionalItemsQuantity: number;
  additionalItemsTotalMinor: number;
  totalMinor: number;
}

/**
 * Fixed-price per-item arithmetic for one matched rate: the one-item fee is
 * charged once for the first purchased unit and the additional-item fee is
 * charged for every remaining unit.
 */
export function calculateShippingRateArithmetic(
  rate: ShippingDestinationRate,
  quantity: number,
): ShippingRateArithmetic {
  const normalizedQuantity = Number.isInteger(quantity) && quantity > 0 ? quantity : 0;
  const additionalItemsQuantity = Math.max(0, normalizedQuantity - 1);
  const baseItemTotalMinor = normalizedQuantity > 0 ? rate.oneItemFeeMinor : 0;
  const additionalItemsTotalMinor = additionalItemsQuantity * rate.additionalItemFeeMinor;

  return {
    quantity: normalizedQuantity,
    baseItemFeeMinor: rate.oneItemFeeMinor,
    additionalItemFeeMinor: rate.additionalItemFeeMinor,
    baseItemTotalMinor,
    additionalItemsQuantity,
    additionalItemsTotalMinor,
    totalMinor: baseItemTotalMinor + additionalItemsTotalMinor,
  };
}
