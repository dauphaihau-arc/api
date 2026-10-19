/**
 * One shipment whose delivery is evidence that the Order it belongs to was
 * delivered.
 */
export interface PayoutAvailabilityEvidence {
  shipmentId: string;
  shipmentPublicId: string;
  deliveredAt: Date;
}

/**
 * The record that one Order's Seller Payable became available: the shop's
 * not-yet-available balance for the Order's money became withdrawable once
 * every required unit was delivered.
 */
export interface PayoutAvailability {
  orderId: string;
  shopId: string;
  currency: string;
  amountMinor: number;
  deliveredAt: Date;
  evidence: PayoutAvailabilityEvidence[];
}
